import DraftTeamOrderEditor from "../../components/DraftTeamOrderEditor";

export const dynamic = "force-dynamic";
export default function DraftAdminPage() {
  return <div className="page"><div className="section-title"><div><span className="draft-countdown-kicker">Admin</span><h1>Draft setup</h1></div></div><DraftTeamOrderEditor /></div>;
}
