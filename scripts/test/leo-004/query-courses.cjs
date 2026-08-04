const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
sb.from("courses").select("id,title").ilike("title", "%新銳%").then(r => {
  if (r.error) { console.error(r.error.message); return; }
  console.log("新銳課程:", JSON.stringify(r.data));
});
sb.from("courses").select("id,title").limit(10).then(r => {
  if (r.error) { console.error(r.error.message); return; }
  console.log("前10門課程:", JSON.stringify(r.data.map(c => ({id:c.id, title:c.title}))));
});
