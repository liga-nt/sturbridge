import { test, expect } from '@playwright/test';
import { signInAsDev } from './helpers/devAuth.js';

// demo-student-001 / demo-class-001 come from scripts/seed-demo.mjs.
const STUDENT_ID = 'demo-student-001';
const STUDENT_NAME = 'Aiden';
const CLASS_ID = 'demo-class-001';
const ROUNDS = 6;

// Drives one round of the student question loop using the dev-only controls
// (student/mcas/+page.svelte, visible because we're signed in as dev). Not
// every question cooperates: multi_part items render their own per-part
// Submit buttons with no Fill Right affordance at all, and a question can
// finish transitioning to the next one mid-interaction — so every step is
// re-checked against the live page rather than assumed, and failures are
// swallowed rather than treated as bugs. mastery.js increments the standard's
// attempts counter whether a submission grades correct (advances right away)
// or wrong twice in a row (reveals the answer, then advances) — either path
// is a legitimate recorded attempt, so this doesn't try to force "correct."
async function driveOneRound(page) {
    const fillRight = page.getByRole('button', { name: 'Fill Right' }).first();
    if (await fillRight.isVisible({ timeout: 2000 }).catch(() => false)) {
        await fillRight.click();
        // Forces the answer component to remount with the correct value
        // bound as its initial prop — give Svelte a beat to finish that
        // before Submit reads the bound value.
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Submit' }).first().click({ timeout: 2000 }).catch(() => {});
    } else {
        await page.getByRole('button', { name: 'Skip' }).first().click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(1500);
}

test('answering questions as a student updates the teacher gradebook', async ({ page }) => {
    test.setTimeout(90_000);

    await signInAsDev(page);

    // Baseline: how many attempts this student has recorded so far.
    await page.goto(`/teacher/student/${STUDENT_ID}`);
    const attemptsLabel = page.getByText('Total attempts', { exact: true });
    await expect(attemptsLabel).toBeVisible();
    const attemptsNumber = attemptsLabel.locator('xpath=./preceding-sibling::p[1]');
    const before = Number(await attemptsNumber.textContent());

    // Drive the real student question loop, impersonating this student as dev.
    await page.goto(`/student?studentId=${STUDENT_ID}`);
    for (let i = 0; i < ROUNDS; i++) {
        await driveOneRound(page);
    }

    // The teacher's per-student view should now reflect those answers.
    await page.goto(`/teacher/student/${STUDENT_ID}`);
    await expect(attemptsLabel).toBeVisible();
    const after = Number(await attemptsNumber.textContent());
    expect(after).toBeGreaterThan(before);

    // And the class-wide mastery grid should list the same student.
    await page.goto(`/teacher?classId=${CLASS_ID}`);
    await expect(page.getByRole('link', { name: STUDENT_NAME, exact: true })).toBeVisible();
});
