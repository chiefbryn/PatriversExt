import { useState } from 'react';
import { DocumentList } from '@/components/documents/DocumentList';
import { CreateDocument } from '@/components/documents/CreateDocument';
import { ViewDocument } from '@/components/documents/ViewDocument';
import type { Document } from '@/hooks/useDocuments';

type View = 'list' | 'create' | 'view';

export default function Documents() {
  const [view, setView] = useState<View>('list');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  return (
    <div className="p-4 sm:p-6">
      {view === 'list' && (
        <>
          <h1 className="text-xl font-semibold mb-4">Documents</h1>
          <DocumentList
            onCreateNew={() => setView('create')}
            onSelectDocument={(doc: Document) => {
              setSelectedDocId(doc.id);
              setView('view');
            }}
          />
        </>
      )}

      {view === 'create' && (
        <CreateDocument
          onBack={() => setView('list')}
          onCreated={(id) => { setSelectedDocId(id); setView('view'); }}
        />
      )}

      {view === 'view' && selectedDocId && (
        <ViewDocument
          documentId={selectedDocId}
          onBack={() => { setSelectedDocId(null); setView('list'); }}
        />
      )}
    </div>
  );
}
