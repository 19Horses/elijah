import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import SignUpForm from '../components/SignUpForm';
import {
  applySelectionColour,
  DEFAULT_COLOUR,
  getStoredColour,
  storeColour,
} from '../services/userColor';
import { getStoredUser } from '../services/userStorage';

const FORM_EXIT_MS = 600;
const CARD_FADE_MS = 500;

function Landing() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [color, setColor] = useState(() => getStoredColour() ?? DEFAULT_COLOUR);
  const [vignetteColor, setVignetteColor] = useState(
    () => getStoredColour() ?? DEFAULT_COLOUR
  );

  const handleColorChange = (nextColor: string) => {
    setColor(nextColor);
    setVignetteColor(nextColor);
    storeColour(nextColor);
    applySelectionColour(nextColor);
  };

  const handleColorHover = (nextColor: string) => {
    setVignetteColor(nextColor);
  };

  const handleColorHoverEnd = () => {
    setVignetteColor(color);
  };
  const [exitPhase, setExitPhase] = useState<'none' | 'form' | 'card'>('none');

  useEffect(() => {
    if (exitPhase === 'form') {
      const timer = window.setTimeout(() => setExitPhase('card'), FORM_EXIT_MS);
      return () => window.clearTimeout(timer);
    }

    if (exitPhase === 'card') {
      const timer = window.setTimeout(() => navigate('/home'), CARD_FADE_MS);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [exitPhase, navigate]);

  if (getStoredUser() && exitPhase === 'none') {
    return <Navigate to="/home" replace />;
  }

  const handleSuccess = () => {
    setExitPhase('form');
    setShowForm(false);
  };

  return (
    <section
      className={`landing${showForm ? ' landing--active' : ''}${
        exitPhase === 'card' ? ' landing--card-exit' : ''
      }`}
    >
      <div
        className="landing__vignette"
        style={{ backgroundColor: vignetteColor }}
        aria-hidden="true"
      />
      <div className="landing__stage">
        <Card
          onClick={() => setShowForm(true)}
          disabled={showForm || exitPhase !== 'none'}
        />
        <SignUpForm
          visible={showForm}
          color={color}
          onColorChange={handleColorChange}
          onColorHover={handleColorHover}
          onColorHoverEnd={handleColorHoverEnd}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      </div>
    </section>
  );
}

export default Landing;
