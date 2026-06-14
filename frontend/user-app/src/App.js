import React from 'react';
import './App.css';

const App = () => {
  const getUser = () => {
    fetch("http://localhost:3000 /api/v1/users")
      .then(response => response.json())
      .then(data => console.log(data));
  };

  return (
    <div>
      App
      {getUser()}
    </div>
  );
};

export default App;