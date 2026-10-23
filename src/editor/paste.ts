/**
 * Вставка из Word, Google Docs и сайтов: оставляем смысл (абзацы, жирный, курсив, списки,
 * ссылки, выравнивание), выкидываем оформление чужого документа — шрифты, цвета, размеры,
 * классы, служебные теги Office. Картинки из буфера не вставляются (как и раньше): фото —
 * через галерею, чтобы они были в «Моих фото» и на сервере.
 */
const KEEP_STYLE = /^(text-align)$/i;

export function cleanPastedHtml(html: string): string {
  // служебное Office: условные комментарии, <o:p>, xml-пространства
  html = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
    .replace(/<\/?(w|m|v):[^>]*>/gi, '');

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, meta, link, title, xml').forEach((n) => n.remove());
  doc.querySelectorAll('img').forEach((n) => {
    // свои картинки галереи (копирование внутри редактора) — оставляем
    if (!n.classList.contains('gl-item')) n.remove();
  });
  doc.querySelectorAll('font').forEach((n) => n.replaceWith(...Array.from(n.childNodes)));

  doc.body.querySelectorAll('*').forEach((el) => {
    if (el.closest('.gl-wrap')) return;
    const style = (el as HTMLElement).style;
    const keep: string[] = [];
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (KEEP_STYLE.test(prop)) keep.push(`${prop}: ${style.getPropertyValue(prop)}`);
    }
    if (keep.length) el.setAttribute('style', keep.join('; '));
    else el.removeAttribute('style');
    el.removeAttribute('class');
    el.removeAttribute('lang');
    el.removeAttribute('align');
    // жирный из Google Docs: <b style="font-weight:normal" id="docs-internal-guid…"> — не жирный
    if (el.tagName === 'B' && el.id.startsWith('docs-internal-guid')) el.replaceWith(...Array.from(el.childNodes));
  });
  return doc.body.innerHTML;
}
