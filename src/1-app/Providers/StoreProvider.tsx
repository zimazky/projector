import React from 'react';
import { StoreContext, IRootStore } from 'src/1-app/Providers/StoreContext';

// Define props for StoreProvider to accept all store instances
interface StoreProviderProps extends IRootStore {
  children: React.ReactNode;
}

const StoreProvider: React.FC<StoreProviderProps> = ({ children, ...stores }) => {
  return (
    <StoreContext.Provider value={stores}>
      {children}
    </StoreContext.Provider>
  );
};

export default StoreProvider;
