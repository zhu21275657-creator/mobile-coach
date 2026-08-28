import worker from "../../worker/src/index.js";

export function onRequest(context) {
  return worker.fetch(context.request, context.env);
}
