import { requestRestart } from "./control.js"

export async function restart() {
  await requestRestart()
  console.log("success")
}
