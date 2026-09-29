// أداة مؤقتة: تجلب ملف CSS لخطوط Google بمتصفح حديث، وتحوّل سطر نص إلى مسارات (للصور الثابتة)
// مقيّدة بنطاقات خطوط Google فقط
import hbPromise from "npm:harfbuzzjs@0.4.7";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ok = (u: string) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u);
Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    const css = url.searchParams.get("css");
    if (css) {
      const u = "https://fonts.googleapis.com/css2?" + css;
      const r = await fetch(u, { headers: { "user-agent": UA } });
      return new Response(await r.text(), { headers: { "content-type": "text/plain" } });
    }
    if (req.method === "POST") {
      const { font, text, label, wght } = await req.json();
      if (!ok(font)) return new Response("bad font", { status: 400 });
      const buf = new Uint8Array(await (await fetch(font)).arrayBuffer());
      const hb: any = await hbPromise;
      const blob = hb.createBlob(buf);
      const face = hb.createFace(blob, 0);
      const f = hb.createFont(face);
      if (wght) try { f.setVariations({ wght }); } catch (_) {}
      const b = hb.createBuffer();
      b.addText(text);
      b.guessSegmentProperties();
      hb.shape(f, b);
      const g = b.json();
      let x = 0; const glyphs: any[] = [];
      for (const it of g) {
        glyphs.push([Math.round(x + (it.dx || 0)), Math.round(it.dy || 0), f.glyphToPath(it.g)]);
        x += it.ax;
      }
      const upem = face.upem;
      b.destroy(); f.destroy(); face.destroy(); blob.destroy();
      return Response.json({ font: label, upem, advance: Math.round(x), text, glyphs });
    }
    return new Response("ok");
  } catch (e) {
    return new Response("err " + (e as Error).message + "\n" + (e as Error).stack, { status: 500 });
  }
});
