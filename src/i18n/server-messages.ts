// Hindi wording for the messages the server sends back (API errors, validation problems, import row errors).
// The server code keeps writing one English message at each place it can fail, so there is a single source of truth for
// what went wrong; this file turns a finished message into Hindi at the edge. A message that no rule knows is sent in
// English rather than hidden, and tests/unit/server-messages.test.ts fails when a new message is added without a rule.

import type { Locale } from "@/i18n/locale";

type Rule = [RegExp, string | ((m: RegExpExecArray) => string)];

// Words that appear inside messages.
const NOUN: Record<string, string> = {
  Item: "दवा / सामान", Batch: "बैच", Store: "स्टोर", Supplier: "सप्लायर", Indent: "इंडेंट", "Stock count": "स्टॉक गिनती", User: "उपयोगकर्ता",
  "Source store": "भेजने वाला स्टोर", "Destination store": "गंतव्य स्टोर", "Supplying store": "सामान देने वाला स्टोर",
  quantity: "मात्रा", Quantity: "मात्रा", MRP: "MRP", "Purchase price": "ख़रीद मूल्य", Reason: "कारण", "Invoice number": "बिल नंबर",
  "Batch number": "बैच नंबर", Unit: "इकाई", Date: "तारीख़", Note: "टिप्पणी", "Patient label": "मरीज़ का नाम / टोकन", Name: "नाम",
};
const noun = (s: string) => NOUN[s] ?? s;
const STATE: Record<string, string> = { draft: "मसौदा", submitted: "जमा", approved: "मंज़ूर", open: "चालू", issued: "जारी", rejected: "अस्वीकृत", partial: "आंशिक रूप से जारी" };
const DOING: Record<string, string> = { issued: "जारी", approved: "मंज़ूर", submitted: "जमा", edited: "बदला", rejected: "अस्वीकार", closed: "बंद", "sent back": "वापस भेजा", "sent back for recounting": "वापस भेजा" };
const fill = (tpl: string, m: RegExpExecArray) => tpl.replace(/\{(\d)\}/g, (_, i: string) => m[Number(i)] ?? "");

const RULES: Rule[] = [
  // ---- sign-in and access
  [/^Please sign in\.$/, "कृपया साइन इन करें।"],
  [/^You do not have permission to do this\.$/, "आपको यह करने की अनुमति नहीं है।"],
  [/^You are not assigned to this store\.$/, "आपको यह स्टोर नहीं सौंपा गया है।"],
  [/^Only an admin can send a count back for recounting\.$/, "केवल एडमिन गिनती को दोबारा गिनने के लिए वापस भेज सकता है।"],
  [/^Something went wrong\.$/, "कुछ गड़बड़ हुई।"],
  [/^That value already exists\.$/, "यह मान पहले से मौजूद है।"],
  [/^Not found\.$/, "नहीं मिला।"],
  [/^This record is referenced by other records\.$/, "इस रिकॉर्ड का इस्तेमाल दूसरे रिकॉर्ड में हो रहा है।"],
  [/^Request body must be valid JSON\.$/, "अनुरोध का मुख्य भाग मान्य JSON होना चाहिए।"],
  // ---- stock rules
  [/^This needs the approval of an active admin$/, "इसके लिए चालू एडमिन की मंज़ूरी चाहिए"],
  [/^Not enough stock$/, "पर्याप्त स्टॉक नहीं है"],
  [/^Only (\d+) in stock$/, "स्टॉक में केवल {1} है"],
  [/^Only (\d+) available but (\d+) requested \((\d+) more are expired and cannot be used\)$/, "केवल {1} उपलब्ध है लेकिन {2} माँगा गया ({3} और एक्सपायर हो चुके हैं और इस्तेमाल नहीं हो सकते)"],
  [/^Only (\d+) available but (\d+) requested$/, "केवल {1} उपलब्ध है लेकिन {2} माँगा गया"],
  [/^There is no usable stock to issue for this indent$/, "इस इंडेंट के लिए जारी करने लायक कोई स्टॉक नहीं है"],
  [/^Batch (.+) has expired and cannot be issued$/, "बैच {1} एक्सपायर हो चुका है और जारी नहीं किया जा सकता"],
  [/^Batch (.+) has already expired \((.+)\) and cannot be received$/, "बैच {1} पहले ही एक्सपायर हो चुका है ({2}) और प्राप्त नहीं किया जा सकता"],
  [/^Batch (.+) has not expired \(expires (.+)\)\. Use an adjustment or a return instead\.$/, "बैच {1} एक्सपायर नहीं हुआ है (एक्सपायरी {2})। इसकी जगह समायोजन या वापसी इस्तेमाल करें।"],
  [/^Batch (.+) is already on record with expiry (.+), not (.+)\. Check the pack\.$/, "बैच {1} पहले से {2} एक्सपायरी के साथ दर्ज है, {3} नहीं। पैक जाँचें।"],
  [/^Batch (.+): price differs from the first receipt, so the original price was kept\.$/, "बैच {1}: क़ीमत पहली प्राप्ति से अलग है, इसलिए पहली क़ीमत रखी गई।"],
  [/^Choosing a batch by hand needs a reason \(at least 3 characters\)$/, "बैच ख़ुद चुनने के लिए कारण ज़रूरी है (कम से कम 3 अक्षर)"],
  [/^The two stores must be different$/, "दोनों स्टोर अलग-अलग होने चाहिए"],
  [/^That batch does not belong to this item$/, "यह बैच इस दवा का नहीं है"],
  [/^(Source store|Destination store|Supplying store|Store|Supplier|Item|Batch|Indent|Stock count|User) not found\.?$/, (m) => `${noun(m[1]!)} नहीं मिला`],
  [/^(Source store|Destination store|Supplying store|Store|Supplier|Item|Batch|Indent|Stock count|User) "(.+)" is not active\.?$/, (m) => `${noun(m[1]!)} "${m[2]}" चालू नहीं है`],
  [/^Add at least one (?:line|item)\.?$/, "कम से कम एक पंक्ति जोड़ें"],
  [/^At most (\d+) lines at a time$/, "एक बार में अधिकतम {1} पंक्तियाँ"],
  [/^At most (\d+) items per indent\.$/, "हर इंडेंट में अधिकतम {1} दवाएँ।"],
  [/^Every line needs an item$/, "हर पंक्ति में एक दवा होनी चाहिए"],
  [/^Invoice date must be a valid date \(YYYY-MM-DD\)$/, "बिल की तारीख़ मान्य तारीख़ होनी चाहिए (YYYY-MM-DD)"],
  [/^Expiry date must be a valid date \(YYYY-MM-DD\)$/, "एक्सपायरी तारीख़ मान्य तारीख़ होनी चाहिए (YYYY-MM-DD)"],
  [/^Batch number is required( \(at most 40 characters\))?$/, (m) => `बैच नंबर ज़रूरी है${m[1] ? " (अधिकतम 40 अक्षर)" : ""}`],
  [/^The invoice total is too large$/, "बिल का कुल बहुत बड़ा है"],
  [/^Patient label must be at most 100 characters$/, "मरीज़ का नाम / टोकन अधिकतम 100 अक्षर का हो सकता है"],
  [/^The adjustment must be a non-zero whole number$/, "समायोजन शून्य से अलग पूर्ण संख्या होना चाहिए"],
  [/^(Indent|Count) #(\d+) is (\w+), so it cannot be (sent back for recounting|sent back|\w+)\.?$/, (m) => `${m[1] === "Indent" ? "इंडेंट" : "गिनती"} #${m[2]} की स्थिति "${STATE[m[3]!.toLowerCase()] ?? m[3]}" है, इसलिए इसे ${DOING[m[4]!] ?? m[4]} नहीं किया जा सकता।`],
  [/^(.+) must be a whole number from 1 to ([\d,]+)$/, (m) => `${noun(m[1]!)} 1 से ${m[2]} के बीच की पूर्ण संख्या होनी चाहिए`],
  [/^(.+) must be whole paise from 0 to (\d+)$/, (m) => `${noun(m[1]!)} 0 से ${m[2]} पैसे के बीच की पूर्ण संख्या होनी चाहिए`],
  [/^(.+) is required$/, (m) => `${noun(m[1]!)} ज़रूरी है`],
  [/^(.+) is invalid$/, (m) => `${noun(m[1]!)} मान्य नहीं है`],
  [/^(.+) must be at most (\d+) characters$/, (m) => `${noun(m[1]!)} अधिकतम ${m[2]} अक्षर का हो सकता है`],
  // ---- indents and counts
  [/^Give a reason for rejecting the indent\.$/, "इंडेंट अस्वीकार करने का कारण लिखें।"],
  [/^Each item can appear only once\. Change the quantity instead\.$/, "हर दवा केवल एक बार आ सकती है। मात्रा बदलें।"],
  [/^The ward and the supplying store must be different\.$/, "वार्ड और सामान देने वाला स्टोर अलग-अलग होने चाहिए।"],
  [/^Quantities must be whole numbers from 1 to ([\d,]+)\.$/, "मात्राएँ 1 से {1} के बीच की पूर्ण संख्याएँ होनी चाहिए।"],
  [/^Counted quantities must be whole numbers from 0 to ([\d,]+)\.$/, "गिनी गई मात्राएँ 0 से {1} के बीच की पूर्ण संख्याएँ होनी चाहिए।"],
  [/^One of the lines does not belong to this (count|indent)\.?$/, (m) => `इनमें से एक पंक्ति इस ${m[1] === "count" ? "गिनती" : "इंडेंट"} की नहीं है।`],
  [/^Count at least one line before submitting\.$/, "जमा करने से पहले कम से कम एक पंक्ति गिनें।"],
  [/^A stock count is already in progress for this store\. Finish or approve it first\.$/, "इस स्टोर की स्टॉक गिनती पहले से चल रही है। पहले उसे पूरा या मंज़ूर करें।"],
  [/^Approved quantities must be whole numbers, 0 or more$/, "मंज़ूर मात्राएँ पूर्ण संख्याएँ होनी चाहिए, 0 या उससे ज़्यादा"],
  [/^Nothing is approved\. Reject the indent instead\.$/, "कुछ भी मंज़ूर नहीं है। इसकी जगह इंडेंट अस्वीकार करें।"],
  [/^You cannot approve more than was requested \((\d+)\)$/, "माँगी गई मात्रा ({1}) से ज़्यादा मंज़ूर नहीं कर सकते"],
  // ---- admin
  [/^You cannot deactivate yourself or remove your own admin role\.$/, "आप ख़ुद को बंद नहीं कर सकते और न अपनी एडमिन भूमिका हटा सकते हैं।"],
  [/^You cannot deactivate yourself\.$/, "आप ख़ुद को बंद नहीं कर सकते।"],
  [/^There must be at least one active admin\.$/, "कम से कम एक चालू एडमिन होना ज़रूरी है।"],
  [/^storeIds: one or more stores do not exist$/, "storeIds: एक या ज़्यादा स्टोर मौजूद नहीं हैं"],
  [/^An item with the same name, strength and form already exists\.$/, "इसी नाम, स्ट्रेंथ और रूप की दवा पहले से मौजूद है।"],
  [/^Nothing to do$/, "करने के लिए कुछ नहीं"],
  // ---- reports, audit
  [/^Unknown report\. Use stock, expiry, consumption, abc or stockout\.$/, "अज्ञात रिपोर्ट। stock, expiry, consumption, abc या stockout इस्तेमाल करें।"],
  [/^format: use json, csv or pdf$/, "format: json, csv या pdf इस्तेमाल करें"],
  [/^(\w+): must be a whole number$/, "{1}: पूर्ण संख्या होनी चाहिए"],
  [/^days: must be a number from 0 to 999$/, "days: 0 से 999 के बीच की संख्या होनी चाहिए"],
  [/^itemId: required$/, "itemId: ज़रूरी है"],
  [/^status: unknown status$/, "status: अज्ञात स्थिति"],
  [/^(\w+) must be a whole number from (\d+) to (\d+)$/, "{1} {2} से {3} के बीच की पूर्ण संख्या होनी चाहिए"],
  [/^dates must be real dates like (\d{4}-\d{2}-\d{2})$/, "तारीख़ें असली तारीख़ें होनी चाहिए, जैसे {1}"],
  // ---- validation (zod)
  [/^A reason is required \(for example Ward consumption\)$/, "कारण ज़रूरी है (जैसे वार्ड खपत)"],
  [/^A reason is required$/, "कारण ज़रूरी है"],
  [/^Give a reason$/, "कारण लिखें"],
  [/^At most (\d+) characters$/, "अधिकतम {1} अक्षर"],
  [/^Cannot be negative$/, "ऋणात्मक नहीं हो सकता"],
  [/^Too large$/, "बहुत बड़ा है"],
  [/^Must be at least 1$/, "कम से कम 1 होना चाहिए"],
  [/^Must be a whole number$/, "पूर्ण संख्या होनी चाहिए"],
  [/^Must be whole paise$/, "पूरे पैसे में होना चाहिए"],
  [/^Choose the destination store$/, "गंतव्य स्टोर चुनें"],
  [/^Enter a valid 10-digit Indian mobile number$/, "10 अंकों का मान्य भारतीय मोबाइल नंबर लिखें"],
  [/^Enter a valid 15-character GSTIN$/, "15 अक्षरों का मान्य GSTIN लिखें"],
  [/^Enter a valid phone number$/, "मान्य फ़ोन नंबर लिखें"],
  [/^GTIN must be 8 to 14 digits$/, "GTIN 8 से 14 अंकों का होना चाहिए"],
  [/^Password is too long \(72 bytes max\)$/, "पासवर्ड बहुत लंबा है (अधिकतम 72 बाइट)"],
  [/^Password must be at least 8 characters$/, "पासवर्ड कम से कम 8 अक्षर का होना चाहिए"],
  [/^Reorder level cannot be below the minimum level$/, "रीऑर्डर स्तर न्यूनतम स्तर से कम नहीं हो सकता"],
  [/^Maximum level cannot be below the reorder level$/, "अधिकतम स्तर रीऑर्डर स्तर से कम नहीं हो सकता"],
  [/^Send lines to save, or an action$/, "सहेजने के लिए पंक्तियाँ भेजें, या कोई कार्य"],
  [/^Use the format YYYY-MM-DD$/, "YYYY-MM-DD रूप इस्तेमाल करें"],
  [/^Invalid input$/, "अमान्य इनपुट"],
  [/^Invalid input: expected (\w+), received (\w+)$/, "अमान्य इनपुट: {1} चाहिए था, {2} मिला"],
  // ---- file import
  [/^No file was uploaded\.$/, "कोई फ़ाइल अपलोड नहीं हुई।"],
  [/^Send the file as multipart\/form-data in a field named "file"\.$/, "फ़ाइल को multipart/form-data में \"file\" नाम के फ़ील्ड में भेजें।"],
  [/^The file is larger than (\d+) MB\.$/, "फ़ाइल {1} MB से बड़ी है।"],
  [/^The file is empty\.$/, "फ़ाइल ख़ाली है।"],
  [/^The workbook has no sheets\.$/, "वर्कबुक में कोई शीट नहीं है।"],
  [/^The file could not be read\. Check that it is a valid CSV or Excel file\.$/, "फ़ाइल पढ़ी नहीं जा सकी। जाँचें कि यह मान्य CSV या एक्सेल फ़ाइल है।"],
  [/^Unsupported file type\. Upload a \.csv, \.xlsx or \.xls file\.$/, "फ़ाइल का यह प्रकार समर्थित नहीं है। .csv, .xlsx या .xls फ़ाइल अपलोड करें।"],
  [/^Missing required column\(s\): (.+)\. Expected headers: (.+)\.$/, "ज़रूरी कॉलम नहीं मिले: {1}। अपेक्षित हेडर: {2}।"],
  [/^Too many rows \((\d+)\)\. Split the file into parts of at most (\d+) rows\.$/, "बहुत ज़्यादा पंक्तियाँ ({1})। फ़ाइल को अधिकतम {2} पंक्तियों के हिस्सों में बाँटें।"],
  [/^Column "(.+)" is not recognised and was ignored\.$/, "कॉलम \"{1}\" पहचाना नहीं गया और छोड़ दिया गया।"],
  [/^Column "(.+)" repeats "(.+)" and was ignored\.$/, "कॉलम \"{1}\" \"{2}\" को दोहराता है और छोड़ दिया गया।"],
  [/^form is required$/, "form ज़रूरी है"],
  [/^"(.*)" is not a known form\. Use one of: (.+)$/, "\"{1}\" कोई ज्ञात form नहीं है। इनमें से एक इस्तेमाल करें: {2}"],
  [/^"(.*)" is not a known storage\. Use ROOM or COLD$/, "\"{1}\" कोई ज्ञात storage नहीं है। ROOM या COLD इस्तेमाल करें"],
  [/^"(.*)" is not yes\/no$/, "\"{1}\" हाँ/नहीं नहीं है"],
  [/^"(.*)" must be a whole number, 0 or more$/, "\"{1}\" पूर्ण संख्या होनी चाहिए, 0 या उससे ज़्यादा"],
  [/^Duplicate of row (\d+) \(same name, strength and form\)$/, "पंक्ति {1} की नक़ल (वही नाम, स्ट्रेंथ और रूप)"],
  [/^Already in the item list \(same name, strength and form\)$/, "दवा सूची में पहले से है (वही नाम, स्ट्रेंथ और रूप)"],
  [/^retention must be a whole number of days, 1 or more$/, "रिटेंशन दिनों की पूर्ण संख्या होनी चाहिए, 1 या उससे ज़्यादा"],
];

/** The message in the language asked for. Unknown messages come back unchanged. */
export function translateMessage(message: string, locale: Locale): string {
  if (locale === "en" || !message) return message;
  // several problems joined by "; " (validation errors) are translated one by one
  if (message.includes("; ") && !RULES.some(([re]) => re.test(message))) return message.split("; ").map((p) => translateMessage(p, locale)).join("; ");
  for (const [re, out] of RULES) {
    const m = re.exec(message);
    if (m) return typeof out === "function" ? out(m) : fill(out, m);
  }
  // "field: message" (validation): keep the field name, translate the rest
  const f = /^([\w.[\]]+): (.+)$/.exec(message);
  if (f) {
    const rest = translateMessage(f[2]!, locale);
    if (rest !== f[2]) return `${f[1]}: ${rest}`;
  }
  return message;
}

export const hasTranslation = (message: string) => translateMessage(message, "hi") !== message;
