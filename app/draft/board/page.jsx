import DraftBoardPage from "../DraftBoardPage";
import { getDraftHistory } from "../../../lib/draftHistory";

export const dynamic = "force-dynamic";

export default async function DraftBoardRoute(props) {
  const params = await props.searchParams;
  const season = params?.season || "2026";
  const demoLimit = season === "demo" ? Number(params?.limit || 40) : null;
  return <DraftBoardPage {...props} history={getDraftHistory(season, demoLimit)} season={season} />;
}

