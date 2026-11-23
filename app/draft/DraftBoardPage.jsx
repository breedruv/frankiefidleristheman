import DraftWorkspace from "../components/DraftWorkspace";
import { currentMember } from "../../lib/auth";

export default async function DraftBoardPage() {
  const member = await currentMember();
  const publicOnly = process.env.PRE_DRAFT_PRIVATE === "true" && !member;

  return (
    <div className="page draft-board-page">
      {!publicOnly && <div className="draft-subnav"><a className="active" href="/draft/board">Draft Board</a><a href="/draft/players">Player Focus</a><a href="/admin/draft">Draft setup</a></div>}
      <DraftWorkspace readOnly={!member} />

    </div>
  );
}


