import JSZip from "jszip";
import type { Slide } from "../types";

const defaultBackground = "#26394d";
const drawingNamespace =
  "http://schemas.openxmlformats.org/drawingml/2006/main";

function makeSlide(title: string, body: string): Slide {
  return {
    id: crypto.randomUUID(),
    title: title || "Untitled slide",
    body,
    background: defaultBackground,
  };
}

function parsePresentationSlide(xml: string, index: number): Slide {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error(`Slide ${index + 1} in this PowerPoint file is malformed.`);
  }
  const paragraphs = Array.from(
    document.getElementsByTagNameNS(drawingNamespace, "p"),
  )
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS(drawingNamespace, "t"))
        .map((text) => text.textContent ?? "")
        .join(""),
    )
    .map((text) => text.trim())
    .filter(Boolean);

  const [title = "", ...body] = paragraphs;
  return makeSlide(title, body.join("\n"));
}

async function importPowerPoint(file: File): Promise<Slide[]> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(file);
  } catch {
    throw new Error("The selected PowerPoint file could not be opened.");
  }

  const slidePaths = Object.keys(archive.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const rightNumber = Number(right.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });

  if (slidePaths.length === 0) {
    throw new Error("This PowerPoint file does not contain any slides.");
  }

  const slides: Slide[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const entry = archive.file(path);
    if (!entry) {
      throw new Error(`Could not read slide ${index + 1} from the PowerPoint file.`);
    }
    slides.push(parsePresentationSlide(await entry.async("string"), index));
  }
  return slides;
}

function importText(fileName: string, text: string): Slide[] {
  const sections = text.includes("\f")
    ? text.split(/\f/)
    : /\.md$/i.test(fileName) && /^#{1,6}\s+/m.test(text)
      ? text.split(/(?=^#{1,6}\s+)/m)
      : text.split(/\n\s*\n/);

  return sections
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const lines = section.split(/\r?\n/);
      const firstLine = (lines.shift() ?? "").trim();
      const title = firstLine.replace(/^#{1,6}\s+/, "").trim();
      return makeSlide(title, lines.join("\n").trim());
    });
}

export async function importSlides(file: File): Promise<Slide[]> {
  if (/\.pptx$/i.test(file.name)) {
    return importPowerPoint(file);
  }
  if (/\.(txt|md)$/i.test(file.name)) {
    const slides = importText(file.name, await file.text());
    if (slides.length === 0) {
      throw new Error("The selected file does not contain any slide content.");
    }
    return slides;
  }
  throw new Error("Choose a PowerPoint (.pptx), text (.txt), or Markdown (.md) file.");
}
