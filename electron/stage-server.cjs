const http = require("node:http");

const stagePage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; media-src data:;">
  <title>StageDesk Presentation</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body { display: grid; place-items: center; overflow: hidden; color: white; background: transparent; font-family: Arial, Helvetica, sans-serif; }
    .background-media { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
    main { position: relative; z-index: 1; width: 88%; text-align: center; white-space: pre-line; text-shadow: 0 3px 24px #0008; }
    .project { margin: 0 0 2vh; color: #ffffffb8; font-size: 1.4vw; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0 0 2vh; font-size: 6vw; font-weight: 600; line-height: 1.08; }
    .body { margin: 0; font-size: 3vw; line-height: 1.4; }
    body.lower-third { align-items: end; }
    .lower-third main { width: 100%; padding: 3vh 8vw; background: #0008; }
    .lyrics .project, .lyrics h1 { display: none; }
    .lyrics .body { font-size: 5vw !important; }
  </style>
</head>
<body>
  <img class="background-media" alt="" hidden>
  <video class="background-media" autoplay muted loop playsinline hidden></video>
  <main aria-live="polite">
    <p class="project"></p>
    <h1></h1>
    <p class="body"></p>
  </main>
  <script>
    const project = document.querySelector(".project");
    const title = document.querySelector("h1");
    const body = document.querySelector(".body");
    const image = document.querySelector("img.background-media");
    const video = document.querySelector("video.background-media");
    let lastState = "";
    let lastVersion = -1;
    async function update() {
      try {
        const response = await fetch("/state?since=" + lastVersion, { cache: "no-store" });
        if (response.status === 204) return;
        if (!response.ok) throw new Error("Stage state unavailable");
        const state = await response.json();
        lastVersion = Number(response.headers.get("X-Stage-Version"));
        const serialized = JSON.stringify(state);
        if (serialized === lastState) return;
        lastState = serialized;
        const slide = state.slide;
        const elements = state.liveElements || { title: true, body: true, background: true };
        const layout = state.liveLayout || "center";
        const main = document.querySelector("main");
        main.className = layout;
        document.body.classList.toggle("lower-third", layout === "lower-third");
        document.body.style.backgroundColor = elements.background ? (slide?.background || "transparent") : "transparent";
        document.body.style.backgroundImage = elements.background && !slide?.mediaUrl && slide?.backgroundEnd
          ? "linear-gradient(135deg, " + slide.background + ", " + slide.backgroundEnd + ")"
          : "none";
        main.style.textAlign = slide?.textAlign || "center";
        document.querySelector("main").style.color = slide?.textColor || "#ffffff";
        title.style.fontSize = (slide?.fontSize || 96) + "px";
        title.style.color = slide?.textColor || "#ffffff";
        body.style.fontSize = Math.round((slide?.fontSize || 48) / 2) + "px";
        body.style.color = slide?.textColor || "#ffffff";
        project.textContent = slide && elements.title && layout !== "lyrics" ? state.projectName : "";
        title.textContent = slide?.title || "";
        body.textContent = slide?.body || "";
        title.hidden = !elements.title || layout === "lyrics";
        body.hidden = !elements.body || layout === "title-only";
        const activeMedia = elements.background && slide?.mediaUrl
          ? (slide.mediaType === "video" ? video : image)
          : null;
        for (const media of [image, video]) {
          media.hidden = media !== activeMedia;
          if (media !== activeMedia && media === video) media.pause();
        }
        if (activeMedia && activeMedia.src !== slide.mediaUrl) activeMedia.src = slide.mediaUrl;
        if (activeMedia === video && video.paused) video.play().catch(() => {});
        document.body.style.visibility = "visible";
      } catch {
        document.body.style.visibility = "hidden";
      }
    }
    document.body.style.visibility = "hidden";
    update();
    setInterval(update, 250);
  </script>
</body>
</html>`;

function createStageServer() {
  let latestState = null;
  let stateVersion = 0;
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    if (pathname === "/state") {
      if (requestUrl.searchParams.get("since") === String(stateVersion)) {
        response.writeHead(204).end();
        return;
      }
      response.setHeader("X-Stage-Version", String(stateVersion));
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(latestState));
      return;
    }
    if (pathname === "/" || pathname === "/stage") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(stagePage);
      return;
    }
    response.writeHead(404).end("Not found");
  });

  return {
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("The StageDesk presentation server did not start."));
            return;
          }
          resolve(`http://127.0.0.1:${address.port}/stage`);
        });
      }),
    publish: (state) => {
      latestState = state;
      stateVersion += 1;
    },
    close: () =>
      new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

module.exports = { createStageServer };
