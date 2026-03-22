declare module "pagerank.js" {
    export interface PageRankApi {
        link(source: string, target: string, weight?: number): void;
        rank(alpha: number, epsilon: number, callback: (node: string, rank: number) => void): void;
        reset(): void;
    }

    const pagerank: PageRankApi;
    export = pagerank;
}
