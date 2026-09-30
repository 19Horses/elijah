import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SignUpForm from '../components/SignUpForm';
import { randomPickerColour } from '../constants/pickerColors';
import {
  applySelectionColour,
  getStoredColour,
  storeColour,
} from '../services/userColor';
import { getStoredUser } from '../services/userStorage';

function Login() {
  const navigate = useNavigate();
  const [color] = useState(() => getStoredColour() ?? randomPickerColour());
  const alreadyLoggedIn = Boolean(getStoredUser());

  useEffect(() => {
    storeColour(color);
    applySelectionColour(color);
  }, [color]);

  useEffect(() => {
    if (alreadyLoggedIn) {
      navigate('/home', { replace: true });
    }
  }, [alreadyLoggedIn, navigate]);

  if (alreadyLoggedIn) {
    return null;
  }

  return (
    <SignUpForm
      visible
      color={color}
      onClose={() => navigate('/home')}
      onSuccess={() => navigate('/home')}
    />
  );
}

export default Login;
