import type { ReactNode } from 'react';

/**
 * 商品說明排版(2026-11-09)。
 * 後台只有一個「商品說明」文字欄位,但 Phase 24 原型的說明區是有結構的:特色段落、兩欄規格表、
 * 條列的使用方式、「注意事項」「保固」收成有框的可收合區。這裡不動資料庫,顯示時照幾條規則排:
 *   - 空一行就是分段。
 *   - 單獨一行、12 字以內、沒有標點的短句當小標(或用「#」「##」「###」開頭強制當小標)。
 *   - 小標底下每一行都是「名稱:內容」→ 兩欄表格;同一段多行 → 條列(1. 開頭就是有序);其他 → 段落。
 *   - 小標含「注意事項」「保固」這類字 → 整段收成可收合的框。
 *   - 「**文字**」顯示成粗體(攤主常從 Markdown 貼過來,之前星號會原樣露出)。
 * 沒寫小標的說明就是分段顯示,跟以前差不多。網頁商店與 LIFF 商品頁共用。
 */

/** 小標底下的每一段各自判斷:每行都「名稱:內容」→ 表格;多行 → 條列;其他 → 段落 */
export type DescPart =
  | { kind: 'table'; rows: [string, string][] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'p'; lines: string[] };

export type DescBlock =
  | { kind: 'lead'; text: string }
  | { kind: 'p'; lines: string[] }
  | { kind: 'section'; title: string; collapsible: boolean; parts: DescPart[] };

const HEADING_MAX_CHARS = 12;
const LEAD_MAX_CHARS = 30;
const SENTENCE_PUNCT = /[，。、：:；;！!？?,]/;
const COLLAPSIBLE_TITLE = /注意事項|使用注意|保固|退換貨|退貨|常見問題|備註|免責/;
const KEY_VALUE = /^([^：:]{1,8})[：:]\s*(.+)$/;
const BULLET_MARK = /^[-•・*]\s*/;
const NUMBER_MARK = /^\d+[.、)]\s*/;
const MD_HEADING = /^#{1,6}\s+(.+)$/;
const BOLD = /\*\*(.+?)\*\*/g;

const charCount = (s: string) => [...s].length;
const stripBold = (s: string) => s.replace(BOLD, '$1');

function splitGroups(text: string): string[][] {
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') {
      if (cur.length) groups.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function headingOf(group: string[], isLast: boolean): string | null {
  if (group.length !== 1) return null;
  const s = group[0];
  const md = MD_HEADING.exec(s);
  if (md) return stripBold(md[1]).trim() || null;
  if (isLast) return null; // 最後一段沒有內容可帶,不當小標
  const plain = stripBold(s);
  if (charCount(plain) > HEADING_MAX_CHARS) return null;
  if (SENTENCE_PUNCT.test(plain)) return null;
  return plain;
}

function partOf(group: string[]): DescPart {
  if (group.length >= 2) {
    const kv = group.map((l) => KEY_VALUE.exec(l));
    if (kv.every(Boolean)) {
      return { kind: 'table', rows: kv.map((m) => [m![1].trim(), m![2].trim()] as [string, string]) };
    }
    const ordered = group.every((l) => NUMBER_MARK.test(l));
    return { kind: 'list', ordered, items: group.map((l) => l.replace(ordered ? NUMBER_MARK : BULLET_MARK, '')) };
  }
  // 只有一行但寫了「1.」「-」這種記號,也當一條清單,跟上下文長得一樣
  if (NUMBER_MARK.test(group[0])) return { kind: 'list', ordered: true, items: [group[0].replace(NUMBER_MARK, '')] };
  if (BULLET_MARK.test(group[0])) return { kind: 'list', ordered: false, items: [group[0].replace(BULLET_MARK, '')] };
  return { kind: 'p', lines: group };
}

export function parseDescription(text: string): DescBlock[] {
  const groups = splitGroups(text);
  const blocks: DescBlock[] = [];
  let i = 0;
  while (i < groups.length) {
    const g = groups[i];
    const title = headingOf(g, i === groups.length - 1);
    if (title !== null) {
      const body: string[][] = [];
      let j = i + 1;
      while (j < groups.length && headingOf(groups[j], j === groups.length - 1) === null) {
        body.push(groups[j]);
        j += 1;
      }
      blocks.push({ kind: 'section', title, collapsible: COLLAPSIBLE_TITLE.test(title), parts: body.map(partOf) });
      i = j;
      continue;
    }
    if (i === 0 && g.length === 1 && charCount(g[0]) <= LEAD_MAX_CHARS && !/。/.test(g[0]) && groups.length > 1) {
      blocks.push({ kind: 'lead', text: g[0] });
    } else {
      blocks.push({ kind: 'p', lines: g });
    }
    i += 1;
  }
  return blocks;
}

export const PRODUCT_DESC_CSS = `
.pdesc{font-size:.875rem;line-height:1.8;color:#3f3f46}
.pdesc p{margin:0 0 12px}
.pdesc .pdesc-lead{font-size:.9375rem;font-weight:500;color:var(--ui-ink,#09090b)}
.pdesc h3{font-size:.875rem;font-weight:600;margin:24px 0 10px;color:var(--ui-ink,#09090b);letter-spacing:-.01em}
.pdesc>h3:first-child{margin-top:0}
.pdesc ul,.pdesc ol{margin:0 0 12px;padding-left:20px}
.pdesc li{padding-left:2px}
.pdesc table{width:100%;border-collapse:collapse;margin:0 0 12px}
.pdesc td{padding:10px 0;border-bottom:1px solid var(--ui-line,#e4e4e7);vertical-align:top;line-height:1.6}
.pdesc td:first-child{color:var(--ui-muted,#71717a);width:7.5rem;padding-right:12px}
.pdesc details{border:1px solid var(--ui-line,#e4e4e7);border-radius:8px;padding:0 16px;margin:10px 0 0}
.pdesc summary{cursor:pointer;font-weight:500;padding:14px 0;list-style:none;display:flex;justify-content:space-between;align-items:center;color:var(--ui-ink,#09090b)}
.pdesc summary::-webkit-details-marker{display:none}
.pdesc summary::after{content:"";width:8px;height:8px;border-right:1.5px solid var(--ui-muted,#71717a);border-bottom:1.5px solid var(--ui-muted,#71717a);transform:rotate(45deg);margin-right:4px;transition:transform .2s;flex-shrink:0}
.pdesc details[open] summary::after{transform:rotate(-135deg)}
.pdesc details>*:last-child{margin-bottom:14px}
.pdesc>*:last-child{margin-bottom:0}
`;

/** 「**文字**」→ <strong>,其他原樣 */
function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(BOLD)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<strong key={k++}>{m[1]}</strong>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <Inline text={l} />
        </span>
      ))}
    </>
  );
}

function Part({ part }: { part: DescPart }): ReactNode {
  if (part.kind === 'table') {
    return (
      <table>
        <tbody>
          {part.rows.map(([k, v], i) => (
            <tr key={i}>
              <td><Inline text={k} /></td>
              <td><Inline text={v} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (part.kind === 'list') {
    const items = part.items.map((it, i) => <li key={i}><Inline text={it} /></li>);
    return part.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  return (
    <p>
      <Lines lines={part.lines} />
    </p>
  );
}

function Parts({ parts }: { parts: DescPart[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <Part key={i} part={p} />
      ))}
    </>
  );
}

/** 商品說明本體(不含「商品說明」標題);樣式自帶,網頁商店與 LIFF 都直接放。 */
export function ProductDescription({ text }: { text: string }) {
  const blocks = parseDescription(text);
  return (
    <div className="pdesc">
      <style dangerouslySetInnerHTML={{ __html: PRODUCT_DESC_CSS }} />
      {blocks.map((b, i) => {
        if (b.kind === 'lead') return <p key={i} className="pdesc-lead">{stripBold(b.text)}</p>;
        if (b.kind === 'p') {
          return (
            <p key={i}>
              <Lines lines={b.lines} />
            </p>
          );
        }
        if (b.collapsible) {
          return (
            <details key={i}>
              <summary>{b.title}</summary>
              <Parts parts={b.parts} />
            </details>
          );
        }
        return (
          <div key={i}>
            <h3>{b.title}</h3>
            <Parts parts={b.parts} />
          </div>
        );
      })}
    </div>
  );
}
