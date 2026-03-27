const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const Anthropic = require('@anthropic-ai/sdk');

initializeApp();

/**
 * activateAccount — called by the client after Google sign-in.
 * Looks up invites/{email}, sets the custom role claim, writes users/{uid}.
 */
exports.activateAccount = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const { uid, token } = request.auth;
    const email = token.email;

    if (!email) {
        throw new HttpsError('invalid-argument', 'No email on token.');
    }

    // Already activated?
    if (token.role) {
        return { role: token.role, classIds: token.classIds || [] };
    }

    const db = getFirestore();
    const auth = getAuth();

    const inviteSnap = await db.collection('invites').doc(email).get();
    if (!inviteSnap.exists) {
        return { status: 'pending' };
    }

    const invite = inviteSnap.data();
    const { role, classIds = [] } = invite;

    // Set custom claim
    await auth.setCustomUserClaims(uid, { role, classIds });

    // Write user doc
    await db.collection('users').doc(uid).set({
        uid,
        email,
        displayName: token.name || email,
        role,
        classIds
    }, { merge: true });

    // Add student to class studentIds if applicable
    if (role === 'student' && classIds.length > 0) {
        for (const classId of classIds) {
            const classRef = db.collection('classes').doc(classId);
            const classSnap = await classRef.get();
            if (classSnap.exists) {
                const existing = classSnap.data().studentIds || [];
                if (!existing.includes(uid)) {
                    await classRef.update({ studentIds: [...existing, uid] });
                }
            }
        }
    }

    // Delete invite
    await db.collection('invites').doc(email).delete();

    return { role, classIds };
});

const db = getFirestore();

exports.generateQuestions = onCall(
    { secrets: ['ANTHROPIC_API_KEY'] },
    async (request) => {
        // Enforce dev role via custom claim
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only the dev role can generate questions.');
        }

        const { standardId, difficulty = 'standard', count = 10 } = request.data;

        if (!standardId) {
            throw new HttpsError('invalid-argument', 'standardId is required.');
        }

        // Fetch the prompt document for this standard
        const promptDoc = await db.collection('prompts').doc(standardId).get();
        if (!promptDoc.exists) {
            throw new HttpsError('not-found', `No prompt found for standard: ${standardId}. Add one in /dev/prompts.`);
        }
        const prompt = promptDoc.data();

        // Build the message to Claude
        const userMessage = [
            prompt.systemPrompt,
            prompt.fewShotExamples || '',
            prompt.schemaInstructions || '',
            `Generate ${count} questions with difficulty level: "${difficulty}".`,
            `Return ONLY a valid JSON array of ${count} question objects. No prose, no markdown fences.`,
            `Each object must match this schema exactly:`,
            `{`,
            `  "questionText": "string",`,
            `  "visual": { "type": "string", "params": {} } | null,`,
            `  "options": [`,
            `    { "id": "A", "text": "string", "isCorrect": false, "feedback": "string" },`,
            `    { "id": "B", "text": "string", "isCorrect": true,  "feedback": "string" },`,
            `    { "id": "C", "text": "string", "isCorrect": false, "feedback": "string" },`,
            `    { "id": "D", "text": "string", "isCorrect": false, "feedback": "string" }`,
            `  ],`,
            `  "difficulty": "${difficulty}"`,
            `}`
        ].filter(Boolean).join('\n');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const message = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            messages: [{ role: 'user', content: userMessage }]
        });

        // Parse the JSON array Claude returns
        let questions;
        try {
            questions = JSON.parse(message.content[0].text);
        } catch {
            throw new HttpsError(
                'internal',
                'AI returned invalid JSON. Check the prompt and try again.'
            );
        }

        if (!Array.isArray(questions)) {
            throw new HttpsError('internal', 'AI response was not a JSON array.');
        }

        // Write each question to Firestore as pending
        const batch = db.batch();
        const questionIds = [];

        for (const q of questions) {
            const ref = db.collection('questions').doc();
            batch.set(ref, {
                ...q,
                standardId,
                status: 'pending',
                generatedAt: Timestamp.now(),
                reviewedAt: null,
                promptVersion: prompt.version ?? '1'
            });
            questionIds.push(ref.id);
        }

        await batch.commit();

        return { questionIds, count: questionIds.length };
    }
);
