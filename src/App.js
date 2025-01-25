import React from 'react';
import MapSelector from './components/MapSelector';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Map Area Selector</h1>
        <p>Draw a polygon or rectangle on the map to select an area</p>
      </header>
      <main>
        <MapSelector />
      </main>
    </div>
  );
}

export default App; 