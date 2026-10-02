import Link from "next/link";
import { EmptyState } from "../components/ui/EmptyState";

export default function NotFound() {
  return (
    <main className="page-state page-state-full">
      <div className="card page-state-card">
        <EmptyState
          icon="search"
          title="Page not found"
          description="The page you're looking for doesn't exist or has moved."
          action={
            <Link href="/" className="btn btn-primary btn-md">
              Back to research
            </Link>
          }
        />
      </div>
    </main>
  );
}
