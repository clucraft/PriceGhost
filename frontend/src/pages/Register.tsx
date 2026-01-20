import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/AuthForm';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (email: string, password: string) => {
    await register(email, password);
    navigate('/');
  };

  return <AuthForm mode="register" onSubmit={handleRegister} />;
}
