const test = require("node:test");
const assert = require("node:assert/strict");
const { createStageServer } = require("../electron/stage-server.cjs");

test("serves a transparent OBS browser source with current presentation state", async () => {
  const stageServer = createStageServer();
  const stageUrl = await stageServer.listen();
  try {
    const pageResponse = await fetch(stageUrl);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /StageDesk Presentation/);

    const initialState = {
      projectName: "Sunday Service",
      sceneName: "Wide",
      sceneColor: "#223344",
      slide: null,
      slideNumber: 0,
      slideCount: 1,
    };
    stageServer.publish(initialState);
    const stateResponse = await fetch(new URL("/state", stageUrl));
    assert.deepEqual(await stateResponse.json(), initialState);
  } finally {
    await stageServer.close();
  }
});

test("rejects unsupported methods and routes", async () => {
  const stageServer = createStageServer();
  const stageUrl = await stageServer.listen();
  try {
    const putResponse = await fetch(stageUrl, { method: "PUT" });
    assert.equal(putResponse.status, 405);
    const missingResponse = await fetch(new URL("/missing", stageUrl));
    assert.equal(missingResponse.status, 404);
  } finally {
    await stageServer.close();
  }
});
