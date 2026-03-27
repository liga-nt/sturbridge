/**
 * Seed Firestore with:
 *   - standards/{standardId}  (28 standards)
 *   - tips/{item_id}          (20 tips for 2019 questions)
 *
 * Usage: node scripts/seed-firestore.mjs
 * Safe to re-run (all writes are set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Standards
// ---------------------------------------------------------------------------

const STANDARDS = [
  {
    id: '4.OA.A.1',
    shortName: 'Multiply Comparisons',
    description: 'Interpret a multiplication equation as a comparison (e.g., 35 = 5 × 7). Represent verbal statements of multiplicative comparisons as multiplication equations.',
    grade: '4', subject: 'math', order: 1
  },
  {
    id: '4.OA.A.2',
    shortName: 'Multiplicative Word Problems',
    description: 'Multiply or divide to solve word problems involving multiplicative comparison, using drawings and equations with a symbol for the unknown, distinguishing multiplicative from additive comparison.',
    grade: '4', subject: 'math', order: 2
  },
  {
    id: '4.OA.A.3',
    shortName: 'Multistep Word Problems',
    description: 'Solve multistep word problems with whole numbers using all four operations, including problems where remainders must be interpreted. Represent with equations and assess reasonableness.',
    grade: '4', subject: 'math', order: 3
  },
  {
    id: '4.OA.B.4',
    shortName: 'Factors and Multiples',
    description: 'Find all factor pairs for whole numbers 1–100. Recognize multiples of each factor. Determine whether a given whole number is a multiple of a given one-digit number, and whether it is prime or composite.',
    grade: '4', subject: 'math', order: 4
  },
  {
    id: '4.OA.C.5',
    shortName: 'Number Patterns',
    description: 'Generate a number or shape pattern that follows a given rule. Identify apparent features of the pattern not explicit in the rule itself.',
    grade: '4', subject: 'math', order: 5
  },
  {
    id: '4.NBT.A.1',
    shortName: 'Place Value Structure',
    description: 'Recognize that in a multi-digit whole number, a digit in any place represents 10 times as much as it represents in the place to its right.',
    grade: '4', subject: 'math', order: 6
  },
  {
    id: '4.NBT.A.2',
    shortName: 'Read Write Numbers',
    description: 'Read and write multi-digit whole numbers using base-ten numerals, number names, and expanded form. Compare two multi-digit numbers using >, =, and < symbols.',
    grade: '4', subject: 'math', order: 7
  },
  {
    id: '4.NBT.A.3',
    shortName: 'Round Numbers',
    description: 'Use place value understanding to round multi-digit whole numbers to any place.',
    grade: '4', subject: 'math', order: 8
  },
  {
    id: '4.NBT.B.4',
    shortName: 'Add Subtract Fluency',
    description: 'Fluently add and subtract multi-digit whole numbers using the standard algorithm.',
    grade: '4', subject: 'math', order: 9
  },
  {
    id: '4.NBT.B.5',
    shortName: 'Multiply Numbers',
    description: 'Multiply a whole number of up to four digits by a one-digit whole number, and multiply two two-digit numbers, using strategies based on place value and properties of operations.',
    grade: '4', subject: 'math', order: 10
  },
  {
    id: '4.NBT.B.6',
    shortName: 'Divide Numbers',
    description: 'Find whole-number quotients and remainders with up to four-digit dividends and one-digit divisors, using strategies based on place value, properties of operations, and/or the relationship between multiplication and division.',
    grade: '4', subject: 'math', order: 11
  },
  {
    id: '4.NF.A.1',
    shortName: 'Equivalent Fractions',
    description: 'Explain why a fraction a/b equals (n×a)/(n×b) using visual fraction models. Use this principle to recognize and generate equivalent fractions, including fractions greater than 1.',
    grade: '4', subject: 'math', order: 12
  },
  {
    id: '4.NF.A.2',
    shortName: 'Compare Fractions',
    description: 'Compare two fractions with different numerators and different denominators by creating common denominators or numerators, or by comparing to a benchmark. Record results with >, =, or <.',
    grade: '4', subject: 'math', order: 13
  },
  {
    id: '4.NF.B.3',
    shortName: 'Add Subtract Fractions',
    description: 'Decompose a fraction into a sum of fractions with the same denominator. Add and subtract mixed numbers with like denominators. Solve word problems involving addition and subtraction of fractions.',
    grade: '4', subject: 'math', order: 14
  },
  {
    id: '4.NF.B.4',
    shortName: 'Multiply Fractions',
    description: 'Solve word problems involving multiplication of a fraction by a whole number, using visual fraction models and equations.',
    grade: '4', subject: 'math', order: 15
  },
  {
    id: '4.NF.C.5',
    shortName: 'Fractions to Hundredths',
    description: 'Express a fraction with denominator 10 as an equivalent fraction with denominator 100. Use this to add two fractions with denominators 10 and 100.',
    grade: '4', subject: 'math', order: 16
  },
  {
    id: '4.NF.C.6',
    shortName: 'Fraction Decimal Notation',
    description: 'Use decimal notation to represent fractions with denominators 10 or 100. Locate decimals on a number line diagram.',
    grade: '4', subject: 'math', order: 17
  },
  {
    id: '4.NF.C.7',
    shortName: 'Compare Decimals',
    description: 'Compare two decimals to hundredths by reasoning about their size. Record results with >, =, or < and justify conclusions using a visual model.',
    grade: '4', subject: 'math', order: 18
  },
  {
    id: '4.MD.A.1',
    shortName: 'Measurement Units',
    description: 'Know relative sizes of measurement units within one system (km, m, cm; kg, g; lb, oz; l, ml; hr, min, sec). Express measurements in a larger unit in terms of a smaller unit.',
    grade: '4', subject: 'math', order: 19
  },
  {
    id: '4.MD.A.2',
    shortName: 'Measurement Word Problems',
    description: 'Use the four operations to solve word problems involving distances, time, liquid volumes, masses, and money, including problems with simple fractions or decimals.',
    grade: '4', subject: 'math', order: 20
  },
  {
    id: '4.MD.A.3',
    shortName: 'Area and Perimeter',
    description: 'Apply the area and perimeter formulas for rectangles in real-world and mathematical problems.',
    grade: '4', subject: 'math', order: 21
  },
  {
    id: '4.MD.B.4',
    shortName: 'Line Plots',
    description: 'Make a line plot (dot plot) to display a data set of measurements in fractions of a unit. Solve problems involving addition and subtraction of fractions using information from line plots.',
    grade: '4', subject: 'math', order: 22
  },
  {
    id: '4.MD.C.5',
    shortName: 'Angle Concepts',
    description: 'Understand angle measurement as a fraction of a circle. An angle that turns through 1/360 of a circle is a one-degree angle.',
    grade: '4', subject: 'math', order: 23
  },
  {
    id: '4.MD.C.6',
    shortName: 'Measure Angles',
    description: 'Measure angles in whole-number degrees using a protractor. Sketch angles of specified measure.',
    grade: '4', subject: 'math', order: 24
  },
  {
    id: '4.MD.C.7',
    shortName: 'Additive Angles',
    description: 'Recognize angle measure as additive. Solve addition and subtraction problems to find unknown angles on a diagram, using an equation with a symbol for the unknown angle.',
    grade: '4', subject: 'math', order: 25
  },
  {
    id: '4.G.A.1',
    shortName: 'Lines and Angles',
    description: 'Draw points, lines, line segments, rays, angles (right, acute, obtuse), and perpendicular and parallel lines. Identify these in two-dimensional figures.',
    grade: '4', subject: 'math', order: 26
  },
  {
    id: '4.G.A.2',
    shortName: 'Classify Shapes',
    description: 'Classify two-dimensional figures based on parallel or perpendicular lines, or angles of a specified size. Recognize right triangles as a category.',
    grade: '4', subject: 'math', order: 27
  },
  {
    id: '4.G.A.3',
    shortName: 'Lines of Symmetry',
    description: 'Recognize a line of symmetry for a two-dimensional figure as a line across the figure such that the figure can be folded along the line into matching parts. Identify line-symmetric figures and draw lines of symmetry.',
    grade: '4', subject: 'math', order: 28
  }
];

// ---------------------------------------------------------------------------
// Tips for all 100 questions (2019–2025)
// ---------------------------------------------------------------------------

const ALL_TIPS = {
  // ── 2019 ──────────────────────────────────────────────────────────────────
  MA227383: {
    tip1: "This question is asking you to find the mystery number — the one that all the numbers in the box are multiples of. Every number in the box must divide evenly by the answer.",
    tip2: "A multiple is what you get when you multiply a number by 1, 2, 3, and so on. Multiples of 4 are 4, 8, 12, 16, 20... To test an answer choice, divide it into every number in the box. If they all divide evenly with no remainder, that's your answer!",
    tip3: "Try each answer choice: divide it into every number in the box. The one that goes into all of them evenly with no remainder is the answer."
  },
  MA311551: {
    tip1: "This question is asking you to add two fractions. Before you can add them, the bottom numbers (denominators) need to match.",
    tip2: "To change a tenths fraction to hundredths, multiply both the top and bottom by 10. For example, 3/10 becomes 30/100. Once both fractions have 100 on the bottom, just add the top numbers together.",
    tip3: "Convert the tenths fraction to hundredths by multiplying top and bottom by 10. Then add the numerators and keep 100 as the denominator."
  },
  MA311583: {
    tip1: "This question shows trail lengths in a table. You need to compare the decimal numbers to find the shortest trail, longest trail, and one in between.",
    tip2: "To compare decimals, look at the whole number part first. If those match, move to the tenths place, then the hundredths. The digit that's bigger means the bigger number.",
    tip3: "Line up all the trail lengths from smallest to largest. Then answer each part based on that ordered list."
  },
  MA303319: {
    tip1: "This question is asking you to find the one expression that does NOT equal Carmen's original expression. All of the choices look similar, but one gives a different total.",
    tip2: "Add up Carmen's original expression to find its total. Then add up each answer choice. The one that gives a different total is your answer.",
    tip3: "Calculate the total of each expression carefully. The one that doesn't match Carmen's total is the answer."
  },
  MA714225971: {
    tip1: "This question asks you to find where 0.27 belongs on the number line and click on that spot.",
    tip2: "On a number line from 0 to 1, the big marks show tenths (0.1, 0.2, 0.3...). The small marks between them show hundredths. 0.27 is 2 big marks plus 7 small marks to the right.",
    tip3: "Count 2 big marks to 0.2, then count 7 small marks to the right. That's where 0.27 lives on the number line."
  },
  MA713939739: {
    tip1: "This question says one measurement is a certain number of times another. That means you'll use multiplication to find the unknown length.",
    tip2: "When something is '5 times as long,' multiply by 5. For example, if a sandbox is 18 feet and a court is 5 times as long, the court is 5 × 18 = 90 feet.",
    tip3: "Multiply to find each length, then use those dimensions to answer the remaining parts."
  },
  MA704647848: {
    tip1: "This question shows pairs of fraction models and asks which ones correctly compare 3/5 and 2/3. Both models in a pair must use the same-sized whole.",
    tip2: "To compare 3/5 and 2/3, find a common denominator: 3/5 = 9/15 and 2/3 = 10/15, so 2/3 is greater than 3/5. Look for pairs where the models are the same size AND the symbol between them is correct.",
    tip3: "Both models in a pair must be the same size. Then check if the comparison symbol matches the true relationship — 3/5 is less than 2/3."
  },
  MA303329: {
    tip1: "This question asks you to add up pieces of wood from a line plot. Count how many pieces have the target length, then multiply.",
    tip2: "Read the line plot to count the dots above the target length. Multiply the count by the piece length (the fraction). Then add whole numbers first, then fractions.",
    tip3: "Count the pieces at that length, multiply by the fraction, then simplify if needed."
  },
  MA714233266: {
    tip1: "This question asks you to identify specific shapes from a set of stickers based on their angles and properties.",
    tip2: "An obtuse angle is wider than a right angle — bigger than 90°. A right angle looks exactly like the corner of a square. Count the sides to know what type of polygon each shape is.",
    tip3: "Check each shape's corners. Wide corners (more than 90°) are obtuse. A perfect square corner is a right angle."
  },
  MA222213: {
    tip1: "This question asks you to convert yards into feet. There are 3 feet in every 1 yard.",
    tip2: "To convert yards to feet, multiply by 3. For example, 2 yards = 2 × 3 = 6 feet. When converting to a smaller unit, the number gets bigger.",
    tip3: "Multiply the number of yards by 3 to get feet."
  },
  MA307033: {
    tip1: "This question asks how many times bigger the value of one digit is compared to another digit in the same number.",
    tip2: "Each place in a number is 10 times bigger than the place to its right. The thousands place is 10 times bigger than the hundreds place. The hundreds place is 10 times bigger than the tens place.",
    tip3: "A digit in the thousands place is always exactly 10 times the value of the same digit in the hundreds place."
  },
  MA307037: {
    tip1: "This question asks you to take a number written in words and rewrite it using digits — that's called standard form.",
    tip2: "Break the number apart: 'fourteen thousand' = 14,000. 'Two hundred' = 200. 'Five' = 5. Add them together and write as one number. Watch out for the tens place — it's zero here!",
    tip3: "14,000 + 200 + 5 = 14,205. Don't skip the zero in the tens place."
  },
  MA714111699: {
    tip1: "This question asks you to describe the dashed line shown on the figure — does it divide the shape into two perfect mirror-image halves?",
    tip2: "A line of symmetry splits a shape into two halves that are exact mirror images. If you fold the shape along that line, both sides match perfectly. A 4-pointed star has symmetry lines going up-down, left-right, and diagonally.",
    tip3: "Imagine folding the shape along the dashed line. If both halves match exactly, it's a line of symmetry."
  },
  MA306994: {
    tip1: "This question shows several angles that share the same point. You need to figure out the size of one missing angle.",
    tip2: "When rays share a vertex, the angles between them add up to the whole angle. If you know the total and one of the parts, subtract to find the other part.",
    tip3: "Set up an equation: total angle = all the parts added together. Subtract the known parts from the total."
  },
  MA279791: {
    tip1: "This question asks you to figure out how many complete posters Abe can hang using the pins he has.",
    tip2: "First find the total number of pins by adding both amounts. Then divide by the number of pins needed per poster. Leftover pins that don't complete a poster don't count.",
    tip3: "Total pins ÷ pins per poster = number of posters. Only whole posters count — ignore any remainder."
  },
  MA713680384: {
    tip1: "This question gives you three rounding statements and asks if each one is true or false.",
    tip2: "To round, find the place you're rounding to. Look at the digit one place to the right. If it's 5 or more, round up. If it's 4 or less, round down. Then compare your result to the statement.",
    tip3: "Round each number carefully, then check whether the statement matches your answer. Equal? True. Different? False."
  },
  MA704650539: {
    tip1: "This question asks you to read both protractors and find which pair of angle measurements is correct.",
    tip2: "A protractor has two sets of numbers — inner and outer scale. Find where the angle's ray sits at 0, then read from that same scale to where the other ray crosses. One angle will be less than 90° and one greater than 90°.",
    tip3: "Line up the protractor so one side of the angle is at 0. Read the scale from there to where the other side crosses."
  },
  MA304988: {
    tip1: "This question asks you to multiply a fraction by a whole number to find the total amount needed.",
    tip2: "To multiply a whole number by a fraction, multiply the whole number by the top number (numerator) and keep the bottom number (denominator) the same. For example: 4 × 2/3 = 8/3. Then convert: 8/3 = 2 and 2/3.",
    tip3: "Multiply whole number × numerator, keep the denominator, then convert the improper fraction to a mixed number."
  },
  MA286777: {
    tip1: "This question shows a subtraction problem with a missing top number. You need to find what that number was.",
    tip2: "To find a missing number in subtraction, add backwards: the number being subtracted plus the answer equals the top number. For example, if ? − 200 = 350, then 350 + 200 = 550.",
    tip3: "Add the number being subtracted to the answer to find the missing top number."
  },
  MA247745: {
    tip1: "This question asks you to find the area of a rectangular room.",
    tip2: "Area = length × width. Multiply the two dimensions of the room together. The answer is in square feet because area tells you how many square units fit inside a shape.",
    tip3: "Multiply length × width. Label your answer in square feet."
  },

  // ── 2021 ──────────────────────────────────────────────────────────────────
  MA704649496: {
    tip1: "This question asks you to shade a fraction model to show the answer to a fraction addition problem.",
    tip2: "To add fractions with the same denominator, just add the top numbers and keep the bottom number the same. For example: 3/10 + 5/10 = 8/10. Then shade that many parts in the model.",
    tip3: "Add the fractions to find the total, then shade that many parts in the model."
  },
  MA307079: {
    tip1: "This question tells you how old someone is compared to someone else and asks you to find the right equation.",
    tip2: "When a problem says someone is a certain number of times older, that means multiplication. If Takara is 4 times as old as her brother, the equation is: Takara's age = 4 × brother's age.",
    tip3: "Find how many times older one person is, and write that as a multiplication equation with the unknown."
  },
  MA229063: {
    tip1: "This question shows a fraction model and asks which decimal numbers have the same value as the shaded amount.",
    tip2: "Count the shaded parts out of the total. Write that as a fraction, then as a decimal. Remember: 0.8 and 0.80 are exactly the same — adding a zero on the end of a decimal doesn't change its value.",
    tip3: "Count the shaded parts, write the fraction, convert to a decimal, then find all equivalent decimal forms."
  },
  MA297973: {
    tip1: "This question asks you to find the total weight of several equal amounts by multiplying.",
    tip2: "When you have several groups of the same fraction, multiply the whole number by the fraction. Multiply the whole number by the numerator (top) and keep the denominator (bottom). For example: 3 × 1/4 = 3/4.",
    tip3: "Multiply the whole number by the numerator. Keep the denominator the same."
  },
  MA800628900: {
    tip1: "This question asks you to pick all the numbers from the list that are prime numbers.",
    tip2: "A prime number has exactly two factors: 1 and itself. To test a number, try dividing it by 2, 3, 5, and 7. If none of those divide it evenly, it's prime. For example, 43 ÷ 2, 3, 5, 7 — none work, so 43 is prime.",
    tip3: "Test each number by dividing by 2, 3, 5, and 7. If none divide evenly, the number is prime."
  },
  MA800780932: {
    tip1: "This question has four parts. Read each part carefully and use the information given to work through them one at a time.",
    tip2: "Break the problem into parts. Use the numbers and clues given in the problem for each part, and check that each answer makes sense before moving on.",
    tip3: "Go back and reread the full problem. Use the given information and work through each part step by step."
  },
  MA306940: {
    tip1: "This question asks you to find the area of a square sign.",
    tip2: "A square has all four sides the same length. To find the area of a square, multiply the side length by itself. For example, a square with 4-inch sides has an area of 4 × 4 = 16 square inches.",
    tip3: "Multiply the side length by itself to find the area."
  },
  MA800629956: {
    tip1: "This question asks you to sort shapes by how many lines of symmetry each one has.",
    tip2: "A line of symmetry divides a shape into two perfect mirror-image halves — like folding paper so both sides match. A square has 4. A rectangle has 2. A parallelogram has 0 because its halves don't mirror. A trapezoid with unequal sides has 0.",
    tip3: "Think about each shape: how many ways can you fold it so both halves line up perfectly?"
  },
  MA800763292: {
    tip1: "This question shows a line plot of snowfall amounts with one missing value. Use the surrounding data to figure out what's missing.",
    tip2: "On a line plot, the values are placed along a number line. Look at the spaces between labeled values to find where the missing amount belongs. It fits between two values you can already see.",
    tip3: "Find the gap on the number line between two labeled values. The missing amount belongs in that space."
  },
  MA270627: {
    tip1: "This question asks you to find the missing number that makes both sides of the equation equal.",
    tip2: "To find a missing number, use the opposite (inverse) operation. If the equation uses addition, subtract to find the unknown. If it uses subtraction, add. Then check: plug your answer back in to make sure both sides match.",
    tip3: "Work backwards using the opposite operation to find the missing value."
  },
  MA803730594: {
    tip1: "This question gives you a number pattern and asks you to find the fifth number.",
    tip2: "Look at the numbers and find the rule — what happens from one number to the next? Is the same amount being added, subtracted, multiplied, or divided? Apply that same rule to find the next number.",
    tip3: "Find the rule from the pattern, then apply it until you reach the fifth number."
  },
  MA736379417: {
    tip1: "This question asks you to find the missing number that makes two fractions equal to each other.",
    tip2: "To make an equivalent fraction, multiply the numerator and denominator by the same number. To go from tenths to hundredths, the denominator is multiplied by 10 — so multiply the numerator by 10 too.",
    tip3: "7/10 = ?/100. The denominator grew from 10 to 100 (multiplied by 10), so multiply the numerator by 10 too: 7 × 10 = 70."
  },
  MA311574: {
    tip1: "This question asks you to find all the triangles that have at least one obtuse angle.",
    tip2: "An obtuse angle is greater than 90° — it's wider than the corner of a square. Look at each triangle and compare its angles to a right angle. If any angle opens wider than 90°, select that triangle.",
    tip3: "Compare each angle in each triangle to 90°. Any angle that opens wider than a square corner is obtuse."
  },
  MA287484: {
    tip1: "This question shows a clock and asks you to identify different times.",
    tip2: "The short hand shows the hour. The long hand shows the minutes. Each number on the clock equals 5 minutes. AM = morning; PM = afternoon and evening.",
    tip3: "Read the short hand for the hour and the long hand for the minutes. Pay attention to AM vs PM."
  },
  MA713629341: {
    tip1: "This question asks you to find the fewest number of bags needed to hold all the items.",
    tip2: "Divide the total number of items by how many fit in each bag. If there are leftover items (a remainder), you need one extra bag for them. For example: 25 items ÷ 4 per bag = 6 bags with 1 left over, so you need 7 bags total.",
    tip3: "Divide the total by the bag size. If there's any remainder, round up to the next whole number."
  },
  MA714226701: {
    tip1: "This question asks you to find the decimal prices for items the shopper bought.",
    tip2: "Decimals use a dot to separate the whole number from the parts. The first place after the dot is tenths, the second is hundredths. For example, 54 cents = $0.54.",
    tip3: "Read each price and write it in decimal form. Match the digits to the correct place values."
  },
  MA803742735: {
    tip1: "This question shows a fraction model and asks which other model shows a fraction equal to it.",
    tip2: "Equivalent fractions represent the same amount even though they look different. Find another model where the same proportion of the whole is shaded, even if it's divided into different-sized pieces.",
    tip3: "Compare the total shaded area in each model to the original. Find the one that covers the same fraction of the whole."
  },
  MA803846674: {
    tip1: "This question asks you to round each number to the nearest ten thousand and decide if each statement is true or false.",
    tip2: "To round to the nearest ten thousand, look at the thousands digit. If it's 5 or more, round up the ten thousands digit. If it's 0–4, keep it the same. For example: 32,456 rounded to the nearest ten thousand is 30,000.",
    tip3: "Find the ten thousands digit, check the thousands digit to decide up or down, then compare your answer to the statement."
  },
  MA306993: {
    tip1: "This question tells you the size of a large angle and asks you to find one of the smaller angles inside it.",
    tip2: "When one angle is made of two smaller angles, they add up to the whole. To find the missing part, subtract the known angle from the total.",
    tip3: "Subtract the angle you know from the total angle to find the missing angle."
  },
  MA803746135: {
    tip1: "This question asks you to compare two fractions and write which one is greater using > or <.",
    tip2: "To compare fractions with different denominators, convert to a common denominator. Multiply top and bottom of each fraction to match them. Then compare the numerators — bigger numerator means bigger fraction.",
    tip3: "Find a common denominator, compare numerators, then write the comparison using > or <."
  },

  // ── 2022 ──────────────────────────────────────────────────────────────────
  MA900845776: {
    tip1: "This question asks you to find the equation that correctly shows how to add the fractions of pizza that were eaten.",
    tip2: "To add fractions, both must have the same denominator (bottom number). Once they match, add the top numbers. For example: 3/8 + 2/8 = 5/8 because 3 + 2 = 5 and the denominator stays 8.",
    tip3: "Find the equation where both fractions have matching denominators, then add the numerators."
  },
  MA307692: {
    tip1: "This question asks you to find which equation correctly shows the result of Claire's subtraction problem.",
    tip2: "You can check a subtraction answer using addition: answer + number subtracted should equal the starting number. For example: if 3012 − 176 = 2836, then 2836 + 176 should equal 3012.",
    tip3: "Add each answer choice back to the number being subtracted. The one that equals the starting number is correct."
  },
  MA704652242: {
    tip1: "This question shows a figure and asks whether each statement about its angles and line segments is true or false.",
    tip2: "Right angles are exactly 90° — they look like the corner of a square. Parallel lines run in the same direction and never meet. Perpendicular lines cross at a right angle.",
    tip3: "Check each statement one by one using what you know about right angles, parallel lines, and perpendicular lines."
  },
  MA307310: {
    tip1: "This question asks you to find the number where the 7 has a value exactly ten times greater than the 7 in a different number.",
    tip2: "In any number, a digit's value depends on its place. A 7 in the hundreds place is worth 700. A 7 in the tens place is worth 70. Moving one place to the left makes the value 10 times bigger.",
    tip3: "Find what place the 7 is in for the given number. The answer's 7 must be one place to the left — making it 10 times greater."
  },
  MA900775955: {
    tip1: "This question asks you to write a comparison statement showing which decimal is greater.",
    tip2: "To compare decimals, look at the tenths place first. 0.29 has 2 tenths; 0.8 has 8 tenths. Since 2 < 8, we know 0.29 is less than 0.8. Use < for 'less than' and > for 'greater than.'",
    tip3: "Compare the tenths digit first. 0.29 has 2 tenths and 0.8 has 8 tenths, so 0.29 < 0.8."
  },
  MA307066: {
    tip1: "This question asks how many lines of symmetry the triangle shown has.",
    tip2: "A line of symmetry divides a shape into two mirror-image halves. An equilateral triangle (all sides equal) has 3. An isosceles triangle (two equal sides) has 1. A scalene triangle (all sides different) has 0.",
    tip3: "Look at the triangle's sides. Two equal sides means exactly one line of symmetry."
  },
  MA623833763: {
    tip1: "This question asks you to match each division equation to a related multiplication equation.",
    tip2: "Multiplication and division are opposites — they're inverse operations. If you know 36 ÷ 4 = p, the related multiplication is p × 4 = 36. Think of it like a fact family using the same three numbers.",
    tip3: "For each division equation, rearrange the same three numbers into a multiplication equation."
  },
  MA903574399: {
    tip1: "This question has several parts about area and perimeter of shapes in a backyard.",
    tip2: "Area = length × width (the space inside a shape). Perimeter = the total distance around the outside. For a rectangle: perimeter = 2 × length + 2 × width.",
    tip3: "For area: multiply length × width. For perimeter: add all four sides or use 2 × length + 2 × width."
  },
  MA800633803: {
    tip1: "This question asks you to find the total amount of water by multiplying a fraction by a whole number.",
    tip2: "Multiply the number of days by the fraction of water per day. Multiply the whole number by the numerator and keep the denominator. For example: 4 × 2/5 = 8/5.",
    tip3: "Multiply the whole number by the numerator. Keep the denominator. Simplify or convert if needed."
  },
  MA900751683: {
    tip1: "This question asks you to find the greatest number of posters the teacher can fully decorate.",
    tip2: "Divide the total number of stickers by the number needed per poster. Only fully decorated posters count — if there are leftover stickers that don't complete one more poster, don't count that last one.",
    tip3: "Divide and use only the whole number part of the answer. Ignore any remainder."
  },
  MA803738583: {
    tip1: "This question has parts about converting measurements and putting them in order from shortest to longest.",
    tip2: "To compare measurements in different units, convert them all to the same unit first. Remember: 1 foot = 12 inches, 1 yard = 3 feet = 36 inches. Once they're all the same unit, compare the numbers.",
    tip3: "Convert everything to inches, then compare the numbers and put them in order."
  },
  MA279790: {
    tip1: "This question asks you to use place value and multiplication to find the missing value.",
    tip2: "When you multiply by a multiple of 100, use what you know and adjust for the zeros. 4 × 7 = 28, so 4 × 700 = 2,800. The zeros in 700 move the answer up in place value.",
    tip3: "Multiply the basic fact first: 4 × 7 = 28. Then add back the two zeros from 700 to get 2,800."
  },
  MA903537924: {
    tip1: "This question asks you to find the measure of angle A.",
    tip2: "Angles can be part of larger angles or along a straight line. Angles on a straight line add up to 180°. Angles in a right angle add up to 90°. Use subtraction to find the missing angle.",
    tip3: "Look at what angles are given and what they add up to. Subtract the known angles from the total."
  },
  MA800767155: {
    tip1: "This question asks you to find the value of c that makes the equation true.",
    tip2: "To solve for a missing number, use the inverse (opposite) operation. If the equation shows multiplication, divide. If it shows addition, subtract. Then check your answer by plugging it back in.",
    tip3: "Work backwards using the opposite operation to find the value of c."
  },
  MA311579A: {
    tip1: "This question asks you to continue a number pattern and find specific values.",
    tip2: "Find the rule — what do you do to each number to get the next one? Is the same amount being added? Multiplied? Apply that same rule step by step to find the missing numbers.",
    tip3: "Identify the rule and apply it to find each value."
  },
  MA900842465: {
    tip1: "This question asks you to round one number to three different place values.",
    tip2: "To round to a place, look at the digit one place to its right. If it's 5 or higher, round up. If it's 4 or lower, keep that digit the same. The digits to the right of the rounded place become zeros.",
    tip3: "Round to thousands, then ten thousands, then hundred thousands — one place at a time."
  },
  MA903134963: {
    tip1: "This question asks you to find two fractions in the list that are equivalent — equal in value.",
    tip2: "Equivalent fractions show the same amount. To check, simplify them both to lowest terms. For example: 4/10 simplifies to 2/5, and 40/100 also simplifies to 2/5 — they're equal!",
    tip3: "Simplify each fraction to lowest terms. The two that simplify to the same fraction are equivalent."
  },
  MA903757124: {
    tip1: "This question asks you to find shapes that have BOTH at least one pair of parallel sides AND at least one right angle.",
    tip2: "Parallel sides run the same direction and never meet — like train tracks. Right angles look like the corner of a square (exactly 90°). A shape needs BOTH features to be selected.",
    tip3: "Look for shapes where some sides are parallel AND some corners are right angles."
  },
  MA286765: {
    tip1: "This question asks you to find the fraction that equals the decimal 0.3.",
    tip2: "A decimal tells you the place value. 0.3 means 3 tenths, which is written as 3/10. If a decimal has two places (like 0.03), the denominator would be 100.",
    tip3: "0.3 means 3 tenths. Write that directly as the fraction 3/10."
  },
  MA704650142: {
    tip1: "This question asks you to shade a fraction model to show the answer to a multiplication expression.",
    tip2: "To multiply a whole number by a fraction, think of it as repeated addition. For example, 4 × 1/3 means four groups of one-third. Shade that many thirds across the model.",
    tip3: "Count the total equal parts you'd have, then shade that many sections in the model."
  },

  // ── 2023 ──────────────────────────────────────────────────────────────────
  MA301798: {
    tip1: "This question tells you Lily made 2 times as many cupcakes as Tommy. You need to find how many Tommy made.",
    tip2: "If Lily made 2 times as many as Tommy, divide Lily's total by 2 to find Tommy's amount. For example: if Lily made 48, then Tommy made 48 ÷ 2 = 24.",
    tip3: "Divide Lily's number of cupcakes by 2 to find Tommy's total."
  },
  MA297614: {
    tip1: "This question asks you to find which day Diego reached a certain number of math problems.",
    tip2: "Diego increases by the same amount each day. Start with Day 1 and keep adding the daily amount. Count which day you reach the target number.",
    tip3: "Make a list: Day 1 total, Day 2 total, Day 3 total... Keep adding until you hit the target."
  },
  MA247705: {
    tip1: "This question asks you to find the shape that has more than one line of symmetry.",
    tip2: "A line of symmetry creates two mirror-image halves. Shapes with many equal sides have many lines of symmetry. For example, a square has 4. Look for the most symmetric shape in the set.",
    tip3: "The shape with more than one line of symmetry can be folded in more than one direction so both halves match."
  },
  MA801035466: {
    tip1: "This question has several parts about rainfall amounts collected by four friends. Compare and add their amounts carefully.",
    tip2: "To compare or add mixed numbers, make sure you're using matching units. Add whole number parts first, then fraction parts — and get a common denominator for the fractions if needed.",
    tip3: "Read each part carefully. Compare or compute the amounts one step at a time."
  },
  MA002128911: {
    tip1: "This question asks you to count how many acute angles the triangle has.",
    tip2: "An acute angle is less than 90° — it's narrower than the corner of a square. A right angle is exactly 90°. An obtuse angle is more than 90°. Look at each corner of the triangle.",
    tip3: "Check each of the triangle's three corners. The ones smaller than a square corner are acute."
  },
  MA002334462: {
    tip1: "This question asks you to place 91/100 on the number line.",
    tip2: "91/100 is the same as 0.91. It's between 0.9 and 1.0, very close to 1.0. Count to 0.9 on the number line, then move 1 small mark to the right.",
    tip3: "0.91 is between 0.90 and 1.00. Place the point 1 small tick mark to the right of 0.90."
  },
  MA307060: {
    tip1: "This question asks you to find the shape that is a quadrilateral (4 sides) with perpendicular sides (right-angle corners).",
    tip2: "Perpendicular lines meet at a right angle (exactly 90°). A quadrilateral with all right angles is a rectangle or square. Look for the 4-sided shape whose corners all look like the corner of a square.",
    tip3: "Find the 4-sided shape where all corners are right angles."
  },
  MA002139080: {
    tip1: "This question asks you to find the total time for the three puzzles that took the most time.",
    tip2: "First find the three greatest values on the line plot. Then add them together. When adding mixed numbers, add the whole number parts first, then the fractions.",
    tip3: "Find the three highest values on the line plot, then add them up."
  },
  MA002034926: {
    tip1: "This question asks you to find the difference (answer to a subtraction problem) between two large numbers.",
    tip2: "When subtracting large numbers, line them up by place value. Subtract one column at a time from right to left. When the top digit is smaller than the bottom, regroup (borrow) from the next column.",
    tip3: "Set up the subtraction carefully, line up the digits, and work from right to left."
  },
  MA903776098: {
    tip1: "This question asks you to find the angle made by a turn that is 1/3 of a full circle.",
    tip2: "A full circle is 360°. To find a fraction of that, multiply 360 by the fraction. For example: 1/2 × 360° = 180°. For 1/3: 360 ÷ 3 = 120°.",
    tip3: "Divide 360° by 3 to find 1/3 of a full circle: 360 ÷ 3 = 120°."
  },
  MA002145158: {
    tip1: "This question asks you to place three decimals into boxes to create comparison statements that are all true.",
    tip2: "Compare decimals by looking at the tenths place first. > means the left side is bigger; < means the left side is smaller. Try placing a number and check if the symbol is correct.",
    tip3: "Start with the largest decimal on the left side of a > sign. Work your way to the smallest. Check each comparison."
  },
  MA002140372: {
    tip1: "This question asks you to find the total measure of several angles that share the same vertex (corner point).",
    tip2: "When several angles share the same vertex, add their measures together. The total is the combined angle from one outside ray to the other.",
    tip3: "Add all the angle measures together to find the total."
  },
  MA307317: {
    tip1: "This question has several parts about a doctor's driving distance and work schedule.",
    tip2: "Use multiplication to find totals when the same amount is repeated. Use addition to combine different amounts. Read each part carefully.",
    tip3: "Work through each part one at a time using the given numbers."
  },
  MA002135528: {
    tip1: "This question asks you to convert 5 kilograms to grams.",
    tip2: "1 kilogram = 1,000 grams. To convert kilograms to grams, multiply by 1,000. For example: 3 kilograms = 3 × 1,000 = 3,000 grams.",
    tip3: "Multiply the number of kilograms by 1,000: 5 × 1,000 = 5,000 grams."
  },
  MA903571693: {
    tip1: "This question asks you to find the correct equation for calculating the perimeter of a rectangle.",
    tip2: "Perimeter is the distance around the outside of a shape. A rectangle has two lengths and two widths. Perimeter = 2 × length + 2 × width.",
    tip3: "The correct formula is 2 × length + 2 × width. For a 5-inch by 4-inch rectangle: 2 × 5 + 2 × 4 = 10 + 8 = 18."
  },
  MA001851276: {
    tip1: "This question gives you number equations and asks if each one is true or false.",
    tip2: "Work out both sides of each equation separately. If the left side equals the right side, it's True. If they're different, it's False.",
    tip3: "Calculate each side, then compare. Equal = True. Different = False."
  },
  MA001750121: {
    tip1: "This question asks you to find which total cost is possible when each lunch costs $7.",
    tip2: "The total must be a multiple of 7 — a number you get by multiplying 7 by a whole number of friends. Divide each answer by 7. If it divides evenly with no remainder, it's a possible total.",
    tip3: "Divide each answer choice by 7. The one with no remainder is correct."
  },
  MA704653374: {
    tip1: "This question asks how many times greater one number is than another.",
    tip2: "To find how many times greater A is than B, divide A by B. For example: 30 is 5 times as many as 6 because 30 ÷ 6 = 5.",
    tip3: "Divide the larger number by the smaller one to find how many times greater it is."
  },
  MA900846441: {
    tip1: "This question asks you to shade a fraction model to show how much chocolate bar is left after both friends eat their share.",
    tip2: "Start with one whole (all parts shaded). Subtract the first friend's share, then the second friend's share. The amount left is what you shade.",
    tip3: "Subtract both amounts eaten from the whole. Shade the remaining fraction in the model."
  },
  MA303324: {
    tip1: "This question asks you to find the total weight of several bags of beans by multiplying.",
    tip2: "Multiply the number of bags by the weight per bag. When multiplying a whole number by a fraction, multiply the whole number by the numerator and keep the denominator. Then simplify.",
    tip3: "Multiply the number of bags by the fraction weight. Simplify the result to get a whole or mixed number."
  },

  // ── 2025 ──────────────────────────────────────────────────────────────────
  MA900754381: {
    tip1: "This question asks you to find the fraction that makes a comparison statement true.",
    tip2: "To compare fractions, convert them to a common denominator. Then compare the numerators. Test each answer choice to see which one makes the inequality true.",
    tip3: "Convert the given fraction and each answer choice to a common denominator, then check which one satisfies the comparison."
  },
  MA136448521: {
    tip1: "This question asks you to sort numbers into two groups: prime and composite.",
    tip2: "A prime number has exactly 2 factors: 1 and itself (for example, 7 — factors are only 1 and 7). A composite number has more than 2 factors (for example, 4 — factors are 1, 2, and 4). Test each number.",
    tip3: "For each number, ask: can anything besides 1 and itself divide it evenly? Yes → composite. No → prime."
  },
  MA800780887: {
    tip1: "This question has four parts about fractions of desserts sold at a cafe.",
    tip2: "When adding fractions, the denominators must match. If they don't, find a common denominator first. When checking an equation, calculate both sides yourself and compare.",
    tip3: "Work through each fraction calculation carefully, making sure denominators match before adding."
  },
  MA010534486: {
    tip1: "This question asks you to find the perimeter of the floor of a room.",
    tip2: "Perimeter is the total distance around the outside of a shape. For a rectangle, add all four sides: length + width + length + width. Or use: 2 × length + 2 × width.",
    tip3: "Add up all four sides of the room to find the total perimeter."
  },
  MA232254177: {
    tip1: "This question asks you to find all shapes that have at least one pair of parallel sides.",
    tip2: "Parallel sides go the same direction and will never meet — like the two rails of a train track. Look at each shape and ask: are there two sides that run the same direction and stay the same distance apart?",
    tip3: "Look for sides going the same direction. If two sides would never cross no matter how far they extend, they're parallel."
  },
  MA202029218: {
    tip1: "This question asks you to round 231,198 to the nearest thousand.",
    tip2: "To round to the nearest thousand, look at the hundreds digit. If it's 5 or higher, round the thousands digit up. If it's 4 or lower, keep the thousands digit the same and change everything after it to zeros.",
    tip3: "The hundreds digit of 231,198 is 1 — that's less than 5, so round down: 231,000."
  },
  MA713677363: {
    tip1: "This question has two parts — one asks you to match equations, and one has true/false statements about number relationships.",
    tip2: "Multiplication and division are inverse operations. Use fact families to match related equations. For the true/false part, test each statement by doing the math.",
    tip3: "Use multiplication and division relationships to work through each part."
  },
  MA900741771: {
    tip1: "This question asks you to find all equations that could be used to solve for y.",
    tip2: "There are multiple correct ways to write the same relationship. If 4 groups of y equals 36, you can write: 4 × y = 36, or 36 ÷ 4 = y, or 36 ÷ y = 4. All three say the same thing.",
    tip3: "Think of all the multiplication and division equations that use the same three numbers."
  },
  MA311554: {
    tip1: "This question asks you to find the angle made by a quarter turn of a full circle.",
    tip2: "A full circle is 360°. To find a fraction of that, divide 360 by the denominator of the fraction. 1/4 of 360° = 360 ÷ 4 = 90°. A quarter turn is a right angle!",
    tip3: "Divide 360° by 4: 360 ÷ 4 = 90°. A quarter circle makes a right angle."
  },
  MA232261850: {
    tip1: "This question shows figures with lines drawn on them and asks if each line is a line of symmetry.",
    tip2: "A line of symmetry creates two perfect mirror-image halves. Imagine folding the shape along the line — if both halves match up exactly, it is a line of symmetry. If they don't match, it's not.",
    tip3: "For each figure, imagine folding along the line. Do both halves match perfectly? Yes = line of symmetry."
  },
  MA233051799: {
    tip1: "This question asks you to add fractions to find the total gallons of water in all the jugs.",
    tip2: "To add fractions with the same denominator, just add the top numbers and keep the bottom number the same. For example: 3/4 + 2/4 + 1/4 = 6/4.",
    tip3: "Add all the numerators together. Keep the denominator the same. Simplify or convert if needed."
  },
  MA307314: {
    tip1: "This question asks you to find the value of w that makes the equation true.",
    tip2: "To find a missing number, use the inverse operation. If the equation shows addition, subtract to find the unknown. If subtraction, add. Check by plugging your answer back in.",
    tip3: "Use the inverse operation to work backwards and find the value of w."
  },
  MA900776517: {
    tip1: "This question asks you to write any decimal number that is less than the decimal shown in the model.",
    tip2: "To compare decimals, look at the tenths place first. Any decimal with a smaller tenths digit is less than the given decimal. There are many correct answers here!",
    tip3: "Any decimal whose tenths digit is smaller, or that has the same tenths digit with a smaller hundredths digit, is a correct answer."
  },
  MA231875780: {
    tip1: "This question has several parts about a gardener's work. Read each part carefully and use the measurements given.",
    tip2: "Remember: 1 kilogram = 1,000 grams. Use multiplication when the same amount is repeated, and addition when combining different amounts.",
    tip3: "Work through each part step by step using the values given in the problem."
  },
  MA000732007: {
    tip1: "This question asks you to identify the measure of each angle shown.",
    tip2: "Angles can be found using relationships. Angles on a straight line add up to 180°. Angles around a full point add up to 360°. Use what you know to find each missing angle.",
    tip3: "Use angle relationships — straight lines add to 180°, full rotations add to 360° — to find each angle."
  },
  MA900750085: {
    tip1: "This question asks you to find three numbers that are factors of 64.",
    tip2: "A factor is a number that divides evenly into 64 with no remainder. To test: divide 64 by each answer choice. If there's no remainder, it's a factor. For example: 64 ÷ 8 = 8 exactly — so 8 is a factor.",
    tip3: "Divide 64 by each answer choice. The ones with no remainder are factors."
  },
  MA231836735: {
    tip1: "This question asks you to write a fraction that equals the decimal shown.",
    tip2: "If a decimal has two digits after the decimal point (hundredths), write those digits as the numerator and put 100 as the denominator. For example: 0.49 = 49/100.",
    tip3: "Read the decimal as hundredths and write it as a fraction with 100 on the bottom."
  },
  MA311543: {
    tip1: "This question asks you to find the quotient — the answer to a division problem.",
    tip2: "Use long division: divide, multiply, subtract, bring down, then repeat. Work from left to right. Check your answer by multiplying the quotient times the divisor — you should get back to the original number.",
    tip3: "Work through long division step by step. Check your answer by multiplying back."
  },
  MA250533: {
    tip1: "This question asks you to find the next number in a pattern by following the same rule.",
    tip2: "Look at how consecutive numbers in the pattern are related. Is the same amount being added, subtracted, multiplied, or divided each time? Apply that rule once more to find the answer.",
    tip3: "Find the rule from the pattern, then apply it one more time."
  },
  MA002162929: {
    tip1: "This question asks you to decide if each equation is true or false.",
    tip2: "Calculate both sides of each equation separately. If the left side equals the right side, it's True. If they're different, it's False.",
    tip3: "Do the math on each side. If they match, it's True. If not, it's False."
  }
};

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedStandards() {
  console.log('Seeding standards...');
  const batch = db.batch();
  for (const std of STANDARDS) {
    const ref = db.collection('standards').doc(std.id);
    batch.set(ref, std, { merge: true });
  }
  await batch.commit();
  console.log(`  ✓ Upserted ${STANDARDS.length} standards`);
}

async function seedTips() {
  console.log('Seeding tips...');
  const batch = db.batch();
  for (const [itemId, tips] of Object.entries(ALL_TIPS)) {
    const ref = db.collection('tips').doc(itemId);
    batch.set(ref, tips, { merge: true });
  }
  await batch.commit();
  console.log(`  ✓ Upserted ${Object.keys(ALL_TIPS).length} tip documents`);
}

async function main() {
  try {
    await seedStandards();
    await seedTips();
    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
