import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import axios from 'axios';

export type TestType = {
  _id: number;
  test: string;
};

const query = `
  *[_type == 'test']{
  test,
  _id
}
`;

const getTest = async (): Promise<{ result: TestType[] }> => {
  const response = await axios.get(getApiUrl(query));
  return response.data;
};

export const useGetTest = () => {
  return useQuery({
    queryKey: ['testData'],
    queryFn: getTest,
    select: (res) => res.result,
  });
};
