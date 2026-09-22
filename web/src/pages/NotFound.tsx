import { Link } from "react-router";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

export default function NotFound() {
  return (
    <>
      <title>Not found · Court Vision</title>
      <PageHeader eyebrow="404" title="No page here" />
      <Card>
        <p className="m-0 text-[17px] text-ink">
          That address does not match anything on Court Vision. <Link to="/" className="font-semibold underline">Go to league trends</Link>.
        </p>
      </Card>
    </>
  );
}
