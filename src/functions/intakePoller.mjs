import { app } from "@azure/functions";
import { runIntakePollerWorkflow } from "../workflows/intakePollerWorkflow.mjs";
import { safeLog } from "../lib/safeLog.mjs";
import { buildErrorLog } from "../lib/errors.mjs";

export async function intakePoller(timer, context) {
  void timer;

  try {
    const summary = await runIntakePollerWorkflow(context);
    safeLog("info", "Intake poller finished.", summary);
  } catch (error) {
    safeLog(
      "error",
      "Intake poller failed.",
      buildErrorLog({ workflow: "intakePoller", stage: "run", error })
    );
    throw error;
  }
}

app.timer("intakePoller", {
  schedule: "0 */5 * * * *",
  handler: intakePoller
});
