import { useContext } from 'react';
import { HeaderContext } from '../context/HeaderContext';

/**
 * Custom hook to access the header context
 * @returns {Object} The header context
 */
export const useHeader = () => {
  const context = useContext(HeaderContext);
  
  if (context === undefined) {
    throw new Error('useHeader must be used within a HeaderProvider');
  }
  
  return context;
};