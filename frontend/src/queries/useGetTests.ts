import { useQuery, gql } from '@apollo/client';

export type Test = {
  title: string;
};

const TEST = gql`
  query GetTests {
    tests {
      title
    }
  }
`;

export const useGetTests = () => {
  return useQuery(TEST);
};
