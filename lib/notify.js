// Phone push via ntfy. NTFY_TOPIC should be long and unguessable: anyone who knows a ntfy.sh topic can read it.
export async function notify(title, message, { priority = 3, tags = [] } = {}) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.log(`[alert, NTFY_TOPIC not set] ${title}: ${message}`);
    return false;
  }
  try {
    const response = await fetch(process.env.NTFY_SERVER || "https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, title, message, priority, tags })
    });
    if (!response.ok) throw new Error(`ntfy ${response.status}`);
    return true;
  } catch (error) {
    console.error(`ntfy failed (${title}): ${error.message}`);
    return false;
  }
}
