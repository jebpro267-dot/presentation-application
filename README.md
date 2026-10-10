# StageDesk

StageDesk is a Windows/macOS desktop application for a single operator running
presentations and a live production. Its three workspaces share one saved show
and the same live cue state.

## Workspaces

### Presentations & songs

- Create and edit slides, lyric cues, and scripture-text cues.
- Import `.pptx`, UTF-8 `.txt`, and Markdown `.md` content.
- Reorder, duplicate, delete, filter, and put cues live.
- Edit titles, section/verse labels, text, background and text colors, alignment,
  and font size.
- Save and reopen projects as validated `.stagedesk.json` files.

PowerPoint import extracts slide text into editable title/body cues. It does not
preserve the original PowerPoint layouts, themes, images, animation, or embedded
media. Scripture cues accept text entered or pasted by the operator; the app
does not include a Bible text library.

### OBS Studio

Connect to a separately installed OBS Studio 28+ WebSocket server to:

- Browse and switch OBS program scenes.
- Add and remove sources, and toggle their visibility.
- Start and stop OBS-configured streaming and recording outputs.
- Adjust the available OBS microphone and desktop audio input mute/volume.
- Enable or disable studio mode and select scene transitions and duration.
- Add the live StageDesk slide output as an OBS browser source.

The browser source is hosted on loopback by the desktop app. Add it to each OBS
scene where presentation content should appear. The audience projector output
and OBS browser source use the same StageDesk slide state.

### Live control

- Operate the cue rundown with previous, next, direct cue selection, and
  blackout controls.
- Switch OBS program scenes and toggle sources from the live workspace.
- Preview a camera locally and select from the cameras exposed by the operating
  system.
- Use standard pan/tilt/zoom controls when the camera, driver, and operating
  system expose those capabilities.
- Open full-screen audience projection windows on selected connected displays.

Camera preview uses the operating system's camera permissions. It is a local
preview and is not itself the OBS program output; add and configure the camera
as an OBS source for streaming or recording. PTZ support is limited to standard
browser-exposed camera controls; vendor-specific PTZ, NDI, and remote camera
protocols are not implemented.

## Connecting OBS Studio

1. Install and launch OBS Studio 28 or newer.
2. In OBS, open **Tools → WebSocket Server Settings** and enable the server.
3. Use the server address shown by OBS (typically `ws://127.0.0.1:4455`) in the
   StageDesk OBS workspace.
4. If OBS authentication is enabled, enter its password for the connection.
   StageDesk uses the password to connect and does not save it.
5. Configure and test cameras, audio devices, filters, transitions, recording
   location, and streaming destination in OBS before going live.

Unencrypted WebSocket connections are limited to this computer. Use `wss://`
for a remote OBS server; connect only to servers and networks you trust.

## Development

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run desktop:dev
```

Type-check and build the renderer:

```sh
npm run build
```

Run unit and local presentation-server tests:

```sh
npm test
```

Package a Windows installer on Windows:

```sh
npm run package:win
```

Package a macOS application on macOS:

```sh
npm run package:mac
```

Code signing, macOS notarization, release publishing, and platform-specific
hardware validation are not configured. The desktop app requires the host
platform's graphical runtime. In Linux containers, Electron also needs its GTK,
ATK, audio, display-server, and other platform runtime dependencies.

## Scope and licensing

StageDesk is an operator interface that controls an existing OBS installation;
it does not bundle or reimplement the OBS executable or native `libobs` engine.
OBS continues to own capture, compositing, filters, plugins, device-specific
configuration, advanced audio, and streaming/recording implementation.

The current application is **not full feature parity** with OBS Studio or
FreeShow. Missing capabilities include a bundled cross-platform media engine,
PowerPoint visual fidelity and media, complete song/scripture libraries,
customized multi-screen stage layouts, device-specific PTZ/NDI support, OBS
filter editing, the full audio mixer/meters, output profiles, and replay buffer
controls. Configure features not exposed in StageDesk directly in OBS Studio.

The OBS WebSocket client is MIT-licensed and connects to a separately installed
OBS process. Bundling OBS/libobs would require platform-specific native builds,
packaging, and compliance with OBS's GPL license and the licenses of bundled
components. GPL-compatible distribution is acceptable for this project, but
bundled OBS/libobs has not been implemented.
