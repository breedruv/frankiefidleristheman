import DraftWorkspace from "../components/DraftWorkspace";
import { currentMember } from "../../lib/auth";

export default async function DraftBoardPage() {
  const member = await currentMember();

  return (
    <div className="page draft-board-page">
      {member && <div className="draft-subnav"><a className="active" href="/draft/board">Draft Board</a><a href="/draft/players">Player Focus</a><a href="/admin/draft">Draft setup</a></div>}
      <DraftWorkspace readOnly={!member} />

    </div>
  );
}


