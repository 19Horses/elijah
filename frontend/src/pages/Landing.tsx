import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import SignUpForm, { PICKER_COLORS } from '../components/SignUpForm';
import { getStoredUser } from '../services/userStorage';

const FORM_EXIT_MS = 600;
const CARD_FADE_MS = 500;

function Landing() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [color, setColor] = useState(PICKER_COLORS[0]);
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
        style={{ backgroundColor: color }}
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
          onColorChange={setColor}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      </div>
    </section>
  );
}

export default Landing;
