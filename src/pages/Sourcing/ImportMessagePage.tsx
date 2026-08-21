import { useNavigate } from "react-router";

import { ImportPanel } from "./ImportPanel";

/**
 * The import screen: one job, on its own page.
 *
 * The work itself lives in ImportPanel, which the comparison screen also uses —
 * saving here moves you straight to the comparison, filtered to what just
 * arrived, because that is the question a price list raises.
 */
export default function ImportMessagePage() {
  const navigate = useNavigate();

  return <ImportPanel onSaved={(messageId) => navigate(`/sourcing/comparison?messageId=${messageId}`)} />;
}
