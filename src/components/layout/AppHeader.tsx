import { BookOpenText } from 'lucide-react';
import Link from 'next/link';

export default function AppHeader() {
  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
            <BookOpenText className="h-7 w-7" />
            <h1 className="text-2xl font-semibold">ActiveReader</h1>
          </Link>
          <a 
            href="https://github.com/dkoepsell" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            @dkoepsell on GitHub
          </a>
        </div>
        {/* Add navigation items here if needed in the future */}
      </div>
    </header>
  );
}
