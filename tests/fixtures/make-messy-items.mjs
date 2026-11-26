// Builds tests/fixtures/messy-items.csv: the kind of file a real store sends (SPEC section 10: "2,000-row messy CSV
// (Hindi names, blank rows, bad dates, duplicates)"), and messy-items.expected.json: exactly what the importer must say about it.
// Run: node tests/fixtures/make-messy-items.mjs      (deterministic: the same files every time)
import { writeFileSync } from "node:fs";

let seed = 2026;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

const ROWS = 2000;
// odd but real header spellings, all understood by the importer
const HEADER = ["Medicine Name", "Generic", "Dose", "Dosage Form", "UOM", "Category", "NLEM", "Storage Condition", "Min Stock", "Reorder Point", "Max Stock"];

const HINDI = ["पैरासिटामोल", "अमोक्सिसिलिन", "आइबुप्रोफेन", "मेटफॉर्मिन", "ओमेप्राज़ोल", "सिप्रोफ्लॉक्सासिन", "एटेनोलोल", "डाइक्लोफेनैक", "सेट्रिज़िन", "एज़िथ्रोमाइसिन"];
const LATIN = ["Paracetamol", "Amoxicillin", "Ibuprofen", "Metformin", "Omeprazole", "Ciprofloxacin", "Atenolol", "Diclofenac", "Cetirizine", "Azithromycin", "Ranitidine", "Salbutamol", "Prednisolone", "Doxycycline", "Pantoprazole"];
const FORMS = ["tablet", "TAB", "Capsule", "syrup", "Injection", "INJ", "ointment", "drops", "consumable", "Tablets"];
const UNITS = ["tablet", "capsule", "bottle", "vial", "tube", "piece", "strip"];
const CATS = ["Analgesics", "Antibacterials", "Gastrointestinal", "Cardiovascular", "Respiratory", "Vitamins, minerals and tonics", "Antiallergics"];

const csvCell = (v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const lines = [HEADER.map(csvCell).join(",")];
const expected = { totalRows: ROWS, blank: 0, valid: 0, errors: {}, duplicateOf: {} };
const validAt = []; // [row number, cells] for duplicates to point back at

function goodRow(i) {
  const hindi = rand() < 0.15;
  const name = hindi ? `${pick(HINDI)} ${i}` : `${pick(LATIN)} ${i}`; // the number keeps every good name unique
  const form = pick(FORMS);
  const min = between(0, 50);
  const reorder = min + between(0, 100);
  const max = reorder + between(0, 400);
  return [
    rand() < 0.2 ? `  ${name}  ` : name, // stray spaces
    rand() < 0.5 ? pick(LATIN) : "",
    rand() < 0.7 ? `${pick([5, 10, 50, 100, 250, 500])} mg` : "",
    form,
    pick(UNITS),
    pick(CATS),
    pick(["yes", "no", "Y", "N", "हाँ", "नहीं", "", "1", "0"]),
    pick(["ROOM", "room", "Ambient", "COLD", "cold chain", "2-8 C", ""]),
    String(min),
    String(reorder),
    String(max),
  ];
}

for (let i = 0; i < ROWS; i++) {
  const row = i + 2; // line number in the file: the header is line 1
  const r = rand();
  let cells;
  if (r < 0.06) {
    // a blank row: only commas, completely empty, or just spaces
    cells = pick([[], ["", "", "", "", "", "", "", "", "", "", ""], ["  ", "", "", "", "", "", "", "", "", "", ""]]);
    expected.blank++;
    lines.push(cells.map(csvCell).join(","));
    continue;
  }
  if (r < 0.69) {
    cells = goodRow(i);
    expected.valid++;
    validAt.push([row, cells]);
  } else if (r < 0.75) {
    cells = goodRow(i);
    cells[3] = pick(["tabletz", "pills", "xyz", "लिक्विड"]); // an unknown form
    expected.errors[row] = ["form"];
  } else if (r < 0.81) {
    cells = goodRow(i);
    cells[8] = pick(["abc", "-5", "31/02/2026", "13/13/2025", "many"]); // text, a negative number, and "bad dates" typed into a number column
    expected.errors[row] = ["min_level"];
  } else if (r < 0.85) {
    cells = goodRow(i);
    cells[8] = "100";
    cells[9] = "50"; // reorder level below the minimum
    cells[10] = "500";
    expected.errors[row] = ["reorder_level"];
  } else if (r < 0.89) {
    cells = goodRow(i);
    cells[0] = pick(["", "   "]); // no name
    expected.errors[row] = ["name"];
  } else if (r < 0.92) {
    cells = goodRow(i);
    cells[6] = pick(["maybe", "kabhi"]);
    expected.errors[row] = ["is_essential"];
  } else if (r < 0.94) {
    cells = goodRow(i);
    cells[7] = "freezer";
    expected.errors[row] = ["storage"];
  } else if (validAt.length > 0) {
    // a duplicate of an earlier good row: same name, strength and form
    const [firstRow, first] = pick(validAt);
    cells = [...first];
    expected.errors[row] = ["name"];
    expected.duplicateOf[row] = firstRow;
  } else {
    cells = goodRow(i);
    expected.valid++;
    validAt.push([row, cells]);
  }
  lines.push(cells.map(csvCell).join(","));
}

// UTF-8 with a byte-order mark and Windows line endings, as Excel saves it
writeFileSync("tests/fixtures/messy-items.csv", "﻿" + lines.join("\r\n") + "\r\n", "utf8");
writeFileSync("tests/fixtures/messy-items.expected.json", JSON.stringify(expected, null, 1) + "\n", "utf8");
console.log(`rows ${ROWS}: ${expected.valid} good, ${expected.blank} blank, ${Object.keys(expected.errors).length} with problems`);
