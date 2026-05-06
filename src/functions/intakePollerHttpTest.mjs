import { app } from "@azure/functions";
import { runIntakePollerWorkflow } from "../workflows/intakePollerWorkflow.mjs";
import { validateIntakePollerConfig } from "../lib/config.mjs";
import { safeLog } from "../lib/safeLog.mjs";
import { buildErrorLog } from "../lib/errors.mjs";

export async function intakePollerHttpTest(request, context) {
  void request;

  const validation = validateIntakePollerConfig();
  if (!validation.isValid) {
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: {
          code: "MISSING_REQUIRED_CONFIG",
          message: "Required intake poller configuration is missing"
        }
      }
    };
  }

  try {
    const summary = await runIntakePollerWorkflow(context);
    return {
      status: 200,
      jsonBody: {
        ok: true,
        summary
      }
    };
  } catch (error) {
    safeLog(
      "error",
      "Manual intake poller test failed.",
      buildErrorLog({ workflow: "intakePoller", stage: "httpTest", error })
    );
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: {
          code: "INTAKE_POLLER_TEST_FAILED",
          message: "Manual intake poller test failed"
        }
      }
    };
  }
}

app.http("intakePollerHttpTest", {
  methods: ["POST"],
  authLevel: "function",
  route: "intake-poller-test",
  handler: intakePollerHttpTest
});
