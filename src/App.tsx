import { Layout } from './components/Layout';
import { GarimpoProvider, useGarimpo } from './context/GarimpoContext';
import { BrainPage } from './pages/BrainPage';
import { ChatPage } from './pages/ChatPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { KanbanPage } from './pages/KanbanPage';
import { ProspectingPage } from './pages/ProspectingPage';

function AppRouter() {
  const { activeTab } = useGarimpo();

  switch (activeTab) {
    case 'dashboard':
      return <DashboardPage />;
    case 'prospeccao':
      return <ProspectingPage />;
    case 'kanban':
      return <KanbanPage />;
    case 'chat':
      return <ChatPage />;
    case 'cerebro':
      return <BrainPage />;
    case 'conexoes':
      return <ConnectionsPage />;
    default:
      return <DashboardPage />;
  }
}

export default function App() {
  return (
    <GarimpoProvider>
      <Layout>
        <AppRouter />
      </Layout>
    </GarimpoProvider>
  );
}
