/**
 * Available courses (grade + subject combos).
 * Each entry maps to a set of standards in Firestore (standards where grade == g && subject == s).
 * Add new entries here as new curricula are built out.
 */
export const COURSES = [
    { grade: '4', subject: 'math',  label: '4th Grade Fundamentals' },
    { grade: '5', subject: 'math',  label: '5th Grade Fundamentals' },
    { grade: '7', subject: 'greek', label: '7th Grade Intro to Greek' },
];

/**
 * Return the display label for a grade+subject pair.
 * Falls back gracefully if the combo isn't in the list yet.
 */
export function courseLabel(grade, subject) {
    const match = COURSES.find((c) => c.grade === String(grade) && c.subject === subject);
    return match ? match.label : `Grade ${grade} ${subject}`;
}
