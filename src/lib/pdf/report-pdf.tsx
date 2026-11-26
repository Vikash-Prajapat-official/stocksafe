import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { displayCell, type Report, type ReportColumn, type ReportRow } from "@/lib/report-format";

// PDFs have no built-in font that can print Hindi, so two Noto Sans files are embedded: Latin for English text,
// numbers and symbols, Devanagari for Hindi. Text is split into runs by script and each run gets its own font.
// (The rupee sign is printed as "Rs " because it is not in the Latin file.)
const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans-devanagari", "files");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  fontsReady = true;
  const file = (subset: string, weight: number) => path.join(FONT_DIR, `noto-sans-devanagari-${subset}-${weight}-normal.woff`);
  Font.register({ family: "NotoLatin", fonts: [{ src: file("latin", 400), fontWeight: 400 }, { src: file("latin", 700), fontWeight: 700 }] });
  Font.register({ family: "NotoDev", fonts: [{ src: file("devanagari", 400), fontWeight: 400 }, { src: file("devanagari", 700), fontWeight: 700 }] });
  Font.registerHyphenationCallback((word) => [word]); // never split words across lines
}

const DEVANAGARI = /([ऀ-ॿ‌‍]+)/;
const isDevanagari = (s: string) => DEVANAGARI.test(s) && s.replace(DEVANAGARI, "") === "";

const MAX_ROWS = 3000;

const s = StyleSheet.create({
  page: { padding: 28, paddingBottom: 40, fontFamily: "NotoLatin", fontSize: 8, color: "#171717" },
  hospital: { fontSize: 14, fontWeight: 700, color: "#15803d" },
  title: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  sub: { fontSize: 8.5, color: "#525252", marginTop: 2 },
  table: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#d4d4d4" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 3 },
  zebra: { backgroundColor: "#fafafa" },
  head: { backgroundColor: "#f0fdf4", fontWeight: 700, borderBottomColor: "#a3a3a3", borderBottomWidth: 1 },
  total: { fontWeight: 700, borderTopWidth: 1, borderTopColor: "#a3a3a3", backgroundColor: "#f5f5f5" },
  cell: { paddingHorizontal: 3 },
  right: { textAlign: "right" },
  notes: { marginTop: 12, color: "#525252", fontSize: 7.5 },
  footer: { position: "absolute", left: 28, right: 28, bottom: 16, fontSize: 7, color: "#737373", textAlign: "center" },
});

const weight = (c: ReportColumn) => (c.key === "item" ? 4 : c.kind === "text" ? 1.6 : c.kind === "date" ? 1.4 : c.kind === "paise" ? 1.5 : 1.1);

/** Text with Hindi runs in the Devanagari font. */
function Rich({ text, variant, right }: { text: string; variant: "cell" | "hospital"; right?: boolean }) {
  const parts = text.split(DEVANAGARI).filter((p) => p !== "");
  const style = variant === "hospital" ? s.hospital : right ? { ...s.cell, ...s.right } : s.cell;
  return (
    <Text style={style}>
      {parts.length === 0
        ? " "
        : parts.map((p, i) => (isDevanagari(p) ? <Text key={i} style={{ fontFamily: "NotoDev" }}>{p}</Text> : p))}
    </Text>
  );
}

function Line({ report, row, kind }: { report: Report; row: ReportRow; kind: "plain" | "zebra" | "total" }) {
  const rowStyle = kind === "zebra" ? { ...s.row, ...s.zebra } : kind === "total" ? { ...s.row, ...s.total } : s.row;
  return (
    <View style={rowStyle} wrap={false}>
      {report.columns.map((c) => (
        <View key={c.key} style={{ flex: weight(c) }}>
          <Rich variant="cell" text={displayCell(c, row[c.key], "Rs ")} right={!(c.kind === "text" || c.kind === "date")} />
        </View>
      ))}
    </View>
  );
}

function ReportDocument({ report, hospitalName, generatedAt }: { report: Report; hospitalName: string; generatedAt: Date }) {
  const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(generatedAt);
  const rows = report.rows.slice(0, MAX_ROWS);
  const cut = report.rows.length > MAX_ROWS || report.truncated;
  const notes = [...(report.notes ?? []), ...(cut ? [`Only the first ${MAX_ROWS} rows are shown here. Download the CSV for the complete list.`] : [])];
  return (
    <Document title={`${report.title} - ${hospitalName}`} author="StockSafe">
      <Page size="A4" orientation={report.columns.length > 5 ? "landscape" : "portrait"} style={s.page}>
        <Rich variant="hospital" text={hospitalName} />
        <Text style={s.title}>{report.title}</Text>
        <Text style={s.sub}>
          {report.subtitle}. Generated {when} (India time).
        </Text>

        <View style={s.table}>
          <View style={{ ...s.row, ...s.head }} fixed>
            {report.columns.map((c) => (
              <View key={c.key} style={{ flex: weight(c) }}>
                <Text style={c.kind === "text" || c.kind === "date" ? s.cell : { ...s.cell, ...s.right }}>{c.label}</Text>
              </View>
            ))}
          </View>
          {rows.map((row, i) => (
            <Line key={i} report={report} row={row} kind={i % 2 ? "zebra" : "plain"} />
          ))}
          {report.totals ? <Line report={report} row={report.totals} kind="total" /> : null}
        </View>

        {notes.map((n, i) => (
          <Text key={i} style={s.notes}>
            {n}
          </Text>
        ))}
        <Text fixed style={s.footer} render={({ pageNumber, totalPages }) => `${report.title}  |  page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}

/** Renders a report as a PDF (A4; landscape when it has many columns). */
export async function renderReportPdf(report: Report, opts: { hospitalName: string; generatedAt?: Date }): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument report={report} hospitalName={opts.hospitalName} generatedAt={opts.generatedAt ?? new Date()} />);
}
