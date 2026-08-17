/**
 * Client-side auth helpers.
 * Uses Firebase callable functions for server-side operations.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '$lib/firebase/client';

// Role home routes
export const ROLE_HOME = {
    student: '/student',
    teacher: '/teacher/classes',
    admin: '/admin/classes',
    dev: '/dev'
};

/**
 * Call the activateAccount Cloud Function.
 * Returns { role, classIds } on success, or { status: 'pending' } if no invite found.
 */
export async function activateAccount() {
    const fn = httpsCallable(functions, 'activateAccount');
    const result = await fn();
    return result.data;
}

/**
 * Re-apply a user's custom claims (role, classIds, schoolId) from their
 * current Firestore users/{uid} doc. Call this after any code path that
 * updates users/{uid}.classIds directly — Firestore rules check the claim
 * on the auth token, not the user doc, so without this the user's writes
 * gated by classIds (quizzes, classes, quizAssignments) stay permission-denied
 * until their token happens to refresh. Admin/dev only.
 */
export async function syncUserClaims(uid) {
    const fn = httpsCallable(functions, 'syncUserClaims');
    const result = await fn({ uid });
    return result.data;
}

/**
 * Get the role from a Firebase token result.
 */
export function getRole(tokenResult) {
    return tokenResult?.claims?.role ?? null;
}

/**
 * Redirect to the appropriate home route for a given role.
 * Returns the path string.
 */
export function roleHomePath(role) {
    return ROLE_HOME[role] || '/';
}

/**
 * Returns true if the given role is allowed access.
 * `allowed` can be a string or array of strings.
 */
export function hasRole(role, allowed) {
    if (!role) return false;
    if (Array.isArray(allowed)) return allowed.includes(role);
    return role === allowed;
}
