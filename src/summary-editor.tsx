import { useLayoutEffect, useRef } from 'react';
import { Bold, Heading2, Italic, List, ListOrdered, Pilcrow, Underline } from 'lucide-react';

const textElements = new Set(['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote']);
const omittedElements = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);

function summaryHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const clean = document.createElement('template');
  // Use an explicit stack because restored files can contain deeply nested markup.
  const pending: { node: Node; target: Node }[] = [];
  function queue(node: Node, target: Node) {
    for (let child = node.lastChild; child; child = child.previousSibling) pending.push({ node: child, target });
  }
  queue(template.content, clean.content);
  while (pending.length) {
    const { node, target } = pending.pop()!;
    if (node.nodeType === Node.TEXT_NODE) target.appendChild(document.createTextNode(node.textContent ?? ''));
    if (!(node.nodeType === Node.ELEMENT_NODE)) continue;
    const tag = (node as Element).localName;
    if (omittedElements.has(tag)) continue;
    const destination = textElements.has(tag) ? target.appendChild(document.createElement(tag)) : target;
    queue(node, destination);
  }
  return clean;
}

export function summaryText(html: string) {
  const clean = summaryHtml(html);
  for (const element of clean.content.querySelectorAll('p, div, br, h2, h3, li, blockquote')) element.after(' ');
  return clean.content.textContent ?? '';
}

const commands = [
  { label: 'Parágrafo', icon: Pilcrow, command: 'formatBlock', value: 'p' },
  { label: 'Subtítulo', icon: Heading2, command: 'formatBlock', value: 'h2' },
  { label: 'Negrito', icon: Bold, command: 'bold' },
  { label: 'Itálico', icon: Italic, command: 'italic' },
  { label: 'Sublinhado', icon: Underline, command: 'underline' },
  { label: 'Lista com marcadores', icon: List, command: 'insertUnorderedList' },
  { label: 'Lista numerada', icon: ListOrdered, command: 'insertOrderedList' },
];

export function SummaryEditor({ initialHtml, readOnly, changed }: {
  initialHtml: string; readOnly: boolean; changed: (html: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const initial = useRef(initialHtml);
  const selection = useRef<Range | null>(null);
  useLayoutEffect(() => {
    const element = editor.current!;
    element.replaceChildren(summaryHtml(initial.current).content);
    function rememberSelection() {
      const current = document.getSelection();
      if (!current?.rangeCount) return;
      const range = current.getRangeAt(0);
      if (element.contains(range.commonAncestorContainer)) selection.current = range.cloneRange();
    }
    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, []);
  function update() { changed(summaryHtml(editor.current!.innerHTML).innerHTML); }
  function format(command: string, value?: string) {
    const element = editor.current!;
    element.focus();
    if (selection.current && element.contains(selection.current.commonAncestorContainer)) {
      const current = document.getSelection();
      current?.removeAllRanges();
      current?.addRange(selection.current);
    }
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, value);
    update();
  }
  return <div className="summary-editor">
    {!readOnly && <div className="summary-format" role="group" aria-label="Formatação">
      {commands.map(({ label, icon: Icon, command, value }) => <button key={label} type="button"
        aria-label={label} title={label} onMouseDown={event => event.preventDefault()} onClick={() => format(command, value)}>
        <Icon size={18} aria-hidden="true"/>
      </button>)}
    </div>}
    <div className="summary-paper" ref={editor} contentEditable={!readOnly} role="textbox" aria-multiline="true"
      aria-readonly={readOnly} aria-label="Conteúdo do resumo" spellCheck lang="pt-BR" onInput={update}
      onDrop={event => event.preventDefault()} onPaste={event => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
        update();
      }}/>
  </div>;
}
