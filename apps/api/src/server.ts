import { buildApp } from "./app";
import { readServerEnv } from "./config/env";

async function main() {
  const env = readServerEnv();
  const app = buildApp({ env });
  let closing = false;

  async function close(signal: NodeJS.Signals) {
    if (closing) {
      return;
    }

    closing = true;
    app.log.info({ signal }, "Shutting down Trip GPS API");

    try {
      await app.close();
      process.exitCode = 0;
    } catch (error) {
      app.log.error({ err: error }, "Failed to shut down cleanly");
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", (signal) => {
    void close(signal);
  });
  process.once("SIGTERM", (signal) => {
    void close(signal);
  });

  try {
    const address = await app.listen({ port: env.port, host: "0.0.0.0" });
    app.log.info(
      {
        address,
        port: env.port,
        store: env.selectedTripGpsStore,
      },
      "Trip GPS API listening"
    );
  } catch (error) {
    app.log.fatal({ err: error }, "Trip GPS API failed to start");
    process.exitCode = 1;
    await app.close().catch(() => undefined);
  }
}

void main();
