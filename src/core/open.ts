export async function openUrl(url: string): Promise<void> {
  const command =
    process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  const code = await Bun.spawn(command, { stdout: "ignore", stderr: "inherit" }).exited;
  if (code !== 0) throw new Error(`Couldn't open ${url}`);
}
