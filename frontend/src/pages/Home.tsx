import { useGetTest } from '../queries/useGetTests';

function Home() {
  const { data, isLoading, isError } = useGetTest();

  console.log(data);

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (isError) {
    return <p>Error!</p>;
  }

  return <p>Hey</p>;
}

export default Home;
