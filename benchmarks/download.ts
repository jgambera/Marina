import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatasetItem } from "./types";

const DATASETS_DIR = join(import.meta.dir, "datasets");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function cachePath(name: string): string {
  return join(DATASETS_DIR, `${name}.json`);
}

function loadCache(name: string): DatasetItem[] | null {
  const path = cachePath(name);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return null;
}

function saveCache(name: string, items: DatasetItem[]): void {
  ensureDir(DATASETS_DIR);
  writeFileSync(cachePath(name), JSON.stringify(items, null, 2));
}

async function fetchHuggingFace(
  dataset: string,
  config: string,
  split: string,
  maxRows: number,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const batchSize = Math.min(100, maxRows);
  let offset = 0;

  while (rows.length < maxRows) {
    const remaining = maxRows - rows.length;
    const length = Math.min(batchSize, remaining);
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HuggingFace API error ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as { rows: { row: unknown }[] };
    if (!data.rows || data.rows.length === 0) break;

    for (const r of data.rows) {
      rows.push(r.row);
    }
    offset += data.rows.length;
    if (data.rows.length < length) break;
  }

  return rows;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function downloadMMLUPro(_dir: string, limit?: number): Promise<DatasetItem[]> {
  const name = "mmlu-pro";
  const cached = loadCache(name);
  if (cached) {
    console.log(`  Using cached ${name} (${cached.length} items)`);
    return limit ? cached.slice(0, limit) : cached;
  }

  console.log("  Downloading MMLU-Pro from HuggingFace...");
  const maxRows = limit || 12000;
  const raw = (await fetchHuggingFace("TIGER-Lab/MMLU-Pro", "default", "test", maxRows)) as {
    question_id?: number;
    question: string;
    options: string[];
    answer: string;
    category: string;
  }[];

  const items: DatasetItem[] = raw.map((r, i) => ({
    id: `mmlu-pro-${r.question_id ?? i}`,
    question: r.question,
    choices: r.options,
    answer: r.answer,
    category: r.category,
  }));

  saveCache(name, items);
  console.log(`  Downloaded ${items.length} MMLU-Pro items`);
  return limit ? items.slice(0, limit) : items;
}

export async function downloadIFEval(_dir: string, limit?: number): Promise<DatasetItem[]> {
  const name = "ifeval";
  const cached = loadCache(name);
  if (cached) {
    console.log(`  Using cached ${name} (${cached.length} items)`);
    return limit ? cached.slice(0, limit) : cached;
  }

  console.log("  Downloading IFEval from HuggingFace...");
  const raw = (await fetchHuggingFace("google/IFEval", "default", "train", 600)) as {
    key?: number;
    prompt: string;
    instruction_id_list: string[];
    kwargs: Record<string, unknown>[];
  }[];

  const items: DatasetItem[] = raw.map((r, i) => ({
    id: `ifeval-${r.key ?? i}`,
    question: r.prompt,
    answer: "",
    metadata: {
      instruction_id_list: r.instruction_id_list,
      kwargs: r.kwargs,
    },
  }));

  saveCache(name, items);
  console.log(`  Downloaded ${items.length} IFEval items`);
  return limit ? items.slice(0, limit) : items;
}

export async function downloadTruthfulQA(_dir: string, limit?: number): Promise<DatasetItem[]> {
  const name = "truthfulqa";
  const cached = loadCache(name);
  if (cached) {
    console.log(`  Using cached ${name} (${cached.length} items)`);
    return limit ? cached.slice(0, limit) : cached;
  }

  console.log("  Downloading TruthfulQA from HuggingFace...");
  const raw = (await fetchHuggingFace(
    "truthfulqa/truthful_qa",
    "multiple_choice",
    "validation",
    900,
  )) as {
    question: string;
    mc2_targets: { choices: string[]; labels: number[] };
  }[];

  const items: DatasetItem[] = raw.map((r, i) => {
    const correctIndices = r.mc2_targets.labels
      .map((l: number, idx: number) => (l === 1 ? idx : -1))
      .filter((idx: number) => idx >= 0);
    return {
      id: `truthfulqa-${i}`,
      question: r.question,
      choices: r.mc2_targets.choices,
      answer: correctIndices.join(","),
      metadata: {
        labels: r.mc2_targets.labels,
        numCorrect: correctIndices.length,
      },
    };
  });

  saveCache(name, items);
  console.log(`  Downloaded ${items.length} TruthfulQA items`);
  return limit ? items.slice(0, limit) : items;
}

export async function downloadHumanEval(_dir: string, limit?: number): Promise<DatasetItem[]> {
  const name = "humaneval";
  const cached = loadCache(name);
  if (cached) {
    console.log(`  Using cached ${name} (${cached.length} items)`);
    return limit ? cached.slice(0, limit) : cached;
  }

  console.log("  Downloading HumanEval from HuggingFace...");
  const raw = (await fetchHuggingFace(
    "openai/openai_humaneval",
    "openai_humaneval",
    "test",
    200,
  )) as {
    task_id: string;
    prompt: string;
    canonical_solution: string;
    test: string;
    entry_point: string;
  }[];

  const items: DatasetItem[] = raw.map((r) => ({
    id: r.task_id,
    question: r.prompt,
    answer: r.canonical_solution,
    metadata: {
      test: r.test,
      entry_point: r.entry_point,
      prompt: r.prompt,
    },
  }));

  saveCache(name, items);
  console.log(`  Downloaded ${items.length} HumanEval items`);
  return limit ? items.slice(0, limit) : items;
}

export async function downloadNarrativeQA(_dir: string, limit?: number): Promise<DatasetItem[]> {
  const name = "narrativeqa";
  const cached = loadCache(name);
  if (cached) {
    console.log(`  Using cached ${name} (${cached.length} items)`);
    return limit ? cached.slice(0, limit) : cached;
  }

  console.log("  Downloading NarrativeQA from HuggingFace...");
  const maxRows = limit || 200;
  const raw = (await fetchHuggingFace("deepmind/narrativeqa", "default", "test", maxRows)) as {
    document: { summary?: { text?: string } };
    question: { text: string };
    answers: { text: string }[];
  }[];

  const items: DatasetItem[] = raw.map((r, i) => ({
    id: `narrativeqa-${i}`,
    question: r.question.text,
    answer: r.answers?.[0]?.text ?? "",
    metadata: {
      summary: r.document?.summary?.text ?? "",
      allAnswers: r.answers?.map((a: { text: string }) => a.text) ?? [],
    },
  }));

  saveCache(name, items);
  console.log(`  Downloaded ${items.length} NarrativeQA items`);
  return limit ? items.slice(0, limit) : items;
}

export async function downloadMTBench(_dir: string, limit?: number): Promise<DatasetItem[]> {
  const name = "mt-bench";
  const cached = loadCache(name);
  if (cached) {
    console.log(`  Using cached ${name} (${cached.length} items)`);
    return limit ? cached.slice(0, limit) : cached;
  }

  console.log("  Downloading MT-Bench from HuggingFace...");
  const raw = (await fetchHuggingFace(
    "HuggingFaceH4/mt_bench_prompts",
    "default",
    "train",
    100,
  )) as {
    prompt_id?: string;
    prompt: string[];
    category: string;
    reference?: string[];
  }[];

  const items: DatasetItem[] = raw.map((r, i) => ({
    id: r.prompt_id ?? `mt-bench-${i}`,
    question: r.prompt[0],
    answer: r.reference?.[0] ?? "",
    category: r.category,
    metadata: {
      turns: r.prompt,
      references: r.reference ?? [],
    },
  }));

  saveCache(name, items);
  console.log(`  Downloaded ${items.length} MT-Bench items`);
  return limit ? items.slice(0, limit) : items;
}

export function loadRetentionBenchmark(_dir: string, limit?: number): DatasetItem[] {
  const tasks = generateRetentionTasks();
  return limit ? tasks.slice(0, limit) : tasks;
}

function generateRetentionTasks(): DatasetItem[] {
  const facts = [
    { teach: "The vault code is 7249", recall: "What is the vault code?", answer: "7249" },
    {
      teach: "My favorite color is cerulean blue",
      recall: "What is my favorite color?",
      answer: "cerulean blue",
    },
    {
      teach: "The secret password is 'luminous-cascade-42'",
      recall: "What is the secret password?",
      answer: "luminous-cascade-42",
    },
    {
      teach: "The meeting is scheduled for March 15th at 3pm",
      recall: "When is the meeting scheduled?",
      answer: "March 15th at 3pm",
    },
    {
      teach: "Project codename is Operation Nightingale",
      recall: "What is the project codename?",
      answer: "Operation Nightingale",
    },
    {
      teach: "The server IP address is 192.168.42.17",
      recall: "What is the server IP address?",
      answer: "192.168.42.17",
    },
    {
      teach: "My employee ID is EMP-8847-XZ",
      recall: "What is my employee ID?",
      answer: "EMP-8847-XZ",
    },
    {
      teach: "The emergency contact number is 555-0137",
      recall: "What is the emergency contact number?",
      answer: "555-0137",
    },
    {
      teach: "The database backup runs at 02:30 UTC daily",
      recall: "When does the database backup run?",
      answer: "02:30 UTC daily",
    },
    {
      teach: "The API rate limit is 1000 requests per minute",
      recall: "What is the API rate limit?",
      answer: "1000 requests per minute",
    },
    {
      teach: "The warehouse is located at 742 Evergreen Terrace",
      recall: "Where is the warehouse located?",
      answer: "742 Evergreen Terrace",
    },
    {
      teach: "The CEO's birthday is November 3rd",
      recall: "When is the CEO's birthday?",
      answer: "November 3rd",
    },
    {
      teach: "The maximum file upload size is 256MB",
      recall: "What is the maximum file upload size?",
      answer: "256MB",
    },
    {
      teach: "The company was founded in 1987",
      recall: "When was the company founded?",
      answer: "1987",
    },
    {
      teach: "The WiFi password is 'quantum-fox-99'",
      recall: "What is the WiFi password?",
      answer: "quantum-fox-99",
    },
    {
      teach: "The quarterly report is due on April 1st",
      recall: "When is the quarterly report due?",
      answer: "April 1st",
    },
    {
      teach: "The build server uses port 8443",
      recall: "What port does the build server use?",
      answer: "8443",
    },
    {
      teach: "The encryption key rotation happens every 90 days",
      recall: "How often does encryption key rotation happen?",
      answer: "every 90 days",
    },
    {
      teach: "The lunch budget is $25 per person",
      recall: "What is the lunch budget per person?",
      answer: "$25",
    },
    {
      teach: "The staging environment URL is staging.example.io",
      recall: "What is the staging environment URL?",
      answer: "staging.example.io",
    },
    {
      teach: "The support ticket SLA is 4 hours",
      recall: "What is the support ticket SLA?",
      answer: "4 hours",
    },
    {
      teach: "The default timeout is 30 seconds",
      recall: "What is the default timeout?",
      answer: "30 seconds",
    },
    {
      teach: "The office door code is 4521#",
      recall: "What is the office door code?",
      answer: "4521#",
    },
    {
      teach: "The vendor contact is Sarah Chen at ext 2847",
      recall: "Who is the vendor contact and their extension?",
      answer: "Sarah Chen at ext 2847",
    },
    {
      teach: "The data retention policy is 7 years",
      recall: "What is the data retention policy?",
      answer: "7 years",
    },
    {
      teach: "The sprint duration is 2 weeks",
      recall: "What is the sprint duration?",
      answer: "2 weeks",
    },
    {
      teach: "The primary DNS server is 10.0.0.53",
      recall: "What is the primary DNS server?",
      answer: "10.0.0.53",
    },
    {
      teach: "The monthly cloud budget cap is $15,000",
      recall: "What is the monthly cloud budget cap?",
      answer: "$15,000",
    },
    {
      teach: "The CI pipeline timeout is 45 minutes",
      recall: "What is the CI pipeline timeout?",
      answer: "45 minutes",
    },
    {
      teach: "The release train departs every Tuesday at 10am",
      recall: "When does the release train depart?",
      answer: "every Tuesday at 10am",
    },
    {
      teach: "The monitoring dashboard is at grafana.internal:3000",
      recall: "Where is the monitoring dashboard?",
      answer: "grafana.internal:3000",
    },
    {
      teach: "The disaster recovery RTO is 4 hours",
      recall: "What is the disaster recovery RTO?",
      answer: "4 hours",
    },
    {
      teach: "The production database is on host db-prod-07",
      recall: "What host is the production database on?",
      answer: "db-prod-07",
    },
    {
      teach: "The compliance audit is scheduled for June 15th",
      recall: "When is the compliance audit scheduled?",
      answer: "June 15th",
    },
    {
      teach: "The API version prefix is /v3/",
      recall: "What is the API version prefix?",
      answer: "/v3/",
    },
    {
      teach: "The maximum concurrent connections is 500",
      recall: "What is the maximum concurrent connections?",
      answer: "500",
    },
    {
      teach: "The backup encryption algorithm is AES-256-GCM",
      recall: "What is the backup encryption algorithm?",
      answer: "AES-256-GCM",
    },
    {
      teach: "The team standup is at 9:15am in Room B",
      recall: "When and where is the team standup?",
      answer: "9:15am in Room B",
    },
    {
      teach: "The log rotation happens at midnight UTC",
      recall: "When does log rotation happen?",
      answer: "midnight UTC",
    },
    {
      teach: "The SSO provider is Okta with tenant ID acme-prod",
      recall: "What is the SSO provider and tenant ID?",
      answer: "Okta with tenant ID acme-prod",
    },
    {
      teach: "The feature flag service is at flags.internal:8080",
      recall: "Where is the feature flag service?",
      answer: "flags.internal:8080",
    },
    {
      teach: "The cache TTL for user sessions is 15 minutes",
      recall: "What is the cache TTL for user sessions?",
      answer: "15 minutes",
    },
    {
      teach: "The PagerDuty escalation policy is P1-critical",
      recall: "What is the PagerDuty escalation policy?",
      answer: "P1-critical",
    },
    {
      teach: "The artifact registry is at artifacts.example.com",
      recall: "Where is the artifact registry?",
      answer: "artifacts.example.com",
    },
    {
      teach: "The database connection pool size is 20",
      recall: "What is the database connection pool size?",
      answer: "20",
    },
    {
      teach: "The security scan runs at 3am on Sundays",
      recall: "When does the security scan run?",
      answer: "3am on Sundays",
    },
    {
      teach: "The CDN origin shield is in us-east-1",
      recall: "Where is the CDN origin shield?",
      answer: "us-east-1",
    },
    {
      teach: "The on-call rotation is weekly starting Monday",
      recall: "How does the on-call rotation work?",
      answer: "weekly starting Monday",
    },
    {
      teach: "The load balancer health check interval is 10 seconds",
      recall: "What is the load balancer health check interval?",
      answer: "10 seconds",
    },
    {
      teach: "The mobile app minimum version is 3.2.1",
      recall: "What is the mobile app minimum version?",
      answer: "3.2.1",
    },
    {
      teach: "The Kafka topic partition count is 12",
      recall: "What is the Kafka topic partition count?",
      answer: "12",
    },
    {
      teach: "The Redis cluster has 6 nodes",
      recall: "How many nodes does the Redis cluster have?",
      answer: "6",
    },
    {
      teach: "The JWT token expiry is 1 hour",
      recall: "What is the JWT token expiry?",
      answer: "1 hour",
    },
    {
      teach: "The code freeze starts December 20th",
      recall: "When does the code freeze start?",
      answer: "December 20th",
    },
    {
      teach: "The test coverage requirement is 80%",
      recall: "What is the test coverage requirement?",
      answer: "80%",
    },
    {
      teach: "The Elasticsearch cluster name is search-prod-v2",
      recall: "What is the Elasticsearch cluster name?",
      answer: "search-prod-v2",
    },
    {
      teach: "The S3 bucket for backups is acme-dr-backups-us-east",
      recall: "What is the S3 bucket for backups?",
      answer: "acme-dr-backups-us-east",
    },
    {
      teach: "The internal wiki is at wiki.internal.example.com",
      recall: "Where is the internal wiki?",
      answer: "wiki.internal.example.com",
    },
    {
      teach: "The GraphQL schema version is 4.7.2",
      recall: "What is the GraphQL schema version?",
      answer: "4.7.2",
    },
    {
      teach: "The Terraform state bucket is tf-state-prod-2024",
      recall: "What is the Terraform state bucket?",
      answer: "tf-state-prod-2024",
    },
    {
      teach: "The container image registry is gcr.io/acme-prod",
      recall: "What is the container image registry?",
      answer: "gcr.io/acme-prod",
    },
    {
      teach: "The webhook retry policy is 3 attempts with exponential backoff",
      recall: "What is the webhook retry policy?",
      answer: "3 attempts with exponential backoff",
    },
    {
      teach: "The DNS TTL for production is 300 seconds",
      recall: "What is the DNS TTL for production?",
      answer: "300 seconds",
    },
    {
      teach: "The development branch naming convention is feat/TICKET-description",
      recall: "What is the development branch naming convention?",
      answer: "feat/TICKET-description",
    },
    {
      teach: "The shared drive is at //nas.internal/shared",
      recall: "Where is the shared drive?",
      answer: "//nas.internal/shared",
    },
    {
      teach: "The OpenTelemetry collector is at otel.internal:4317",
      recall: "Where is the OpenTelemetry collector?",
      answer: "otel.internal:4317",
    },
    {
      teach: "The maximum request body size is 10MB",
      recall: "What is the maximum request body size?",
      answer: "10MB",
    },
    {
      teach: "The Vault secret engine path is secret/data/prod",
      recall: "What is the Vault secret engine path?",
      answer: "secret/data/prod",
    },
    {
      teach: "The message queue dead letter threshold is 5 retries",
      recall: "What is the message queue dead letter threshold?",
      answer: "5 retries",
    },
    {
      teach: "The service mesh uses Istio version 1.19",
      recall: "What version of Istio does the service mesh use?",
      answer: "1.19",
    },
    {
      teach: "The database migration tool is Flyway",
      recall: "What is the database migration tool?",
      answer: "Flyway",
    },
    {
      teach: "The canary deployment percentage is 5%",
      recall: "What is the canary deployment percentage?",
      answer: "5%",
    },
    {
      teach: "The error budget for the quarter is 99.9% uptime",
      recall: "What is the error budget for the quarter?",
      answer: "99.9% uptime",
    },
    {
      teach: "The primary cloud region is eu-west-1",
      recall: "What is the primary cloud region?",
      answer: "eu-west-1",
    },
    {
      teach: "The API gateway is Kong version 3.4",
      recall: "What API gateway and version is used?",
      answer: "Kong version 3.4",
    },
    {
      teach: "The secrets rotation schedule is every 60 days",
      recall: "What is the secrets rotation schedule?",
      answer: "every 60 days",
    },
    {
      teach: "The performance budget for LCP is 2.5 seconds",
      recall: "What is the performance budget for LCP?",
      answer: "2.5 seconds",
    },
    {
      teach: "The incident commander for this week is Alex Park",
      recall: "Who is the incident commander this week?",
      answer: "Alex Park",
    },
    {
      teach: "The WAF rule set version is OWASP-3.3.4",
      recall: "What is the WAF rule set version?",
      answer: "OWASP-3.3.4",
    },
    {
      teach: "The batch processing window is 1am-5am UTC",
      recall: "What is the batch processing window?",
      answer: "1am-5am UTC",
    },
    {
      teach: "The synthetic monitoring check interval is 5 minutes",
      recall: "What is the synthetic monitoring check interval?",
      answer: "5 minutes",
    },
    {
      teach: "The blue-green deployment switch takes 30 seconds",
      recall: "How long does the blue-green deployment switch take?",
      answer: "30 seconds",
    },
    {
      teach: "The code review approval requirement is 2 reviewers",
      recall: "How many reviewers are required for code review approval?",
      answer: "2",
    },
    {
      teach: "The container CPU limit is 2 cores",
      recall: "What is the container CPU limit?",
      answer: "2 cores",
    },
    {
      teach: "The container memory limit is 4GB",
      recall: "What is the container memory limit?",
      answer: "4GB",
    },
    {
      teach: "The artifact retention period is 30 days",
      recall: "What is the artifact retention period?",
      answer: "30 days",
    },
    {
      teach: "The A/B test minimum sample size is 10,000 users",
      recall: "What is the A/B test minimum sample size?",
      answer: "10,000 users",
    },
    {
      teach: "The geographic failover target is us-west-2",
      recall: "What is the geographic failover target?",
      answer: "us-west-2",
    },
    {
      teach: "The TLS certificate expires on 2026-09-15",
      recall: "When does the TLS certificate expire?",
      answer: "2026-09-15",
    },
    {
      teach: "The config server is at consul.internal:8500",
      recall: "Where is the config server?",
      answer: "consul.internal:8500",
    },
    {
      teach: "The rate limiter uses a sliding window of 60 seconds",
      recall: "What window does the rate limiter use?",
      answer: "sliding window of 60 seconds",
    },
    {
      teach: "The deployment approval chain is dev→staging→prod",
      recall: "What is the deployment approval chain?",
      answer: "dev→staging→prod",
    },
    {
      teach: "The observability stack is Grafana+Loki+Tempo",
      recall: "What is the observability stack?",
      answer: "Grafana+Loki+Tempo",
    },
    {
      teach: "The SRE team Slack channel is #sre-incidents",
      recall: "What is the SRE team Slack channel?",
      answer: "#sre-incidents",
    },
    {
      teach: "The feature rollout percentage increment is 10%",
      recall: "What is the feature rollout percentage increment?",
      answer: "10%",
    },
    {
      teach: "The database replica count is 3",
      recall: "What is the database replica count?",
      answer: "3",
    },
    {
      teach: "The cross-region replication lag target is under 500ms",
      recall: "What is the cross-region replication lag target?",
      answer: "under 500ms",
    },
    {
      teach: "The chaos engineering experiment runs monthly on the first Wednesday",
      recall: "When does the chaos engineering experiment run?",
      answer: "monthly on the first Wednesday",
    },
    {
      teach: "The HTTP keep-alive timeout is 65 seconds",
      recall: "What is the HTTP keep-alive timeout?",
      answer: "65 seconds",
    },
    {
      teach: "The gitops repo is at github.com/acme/infrastructure",
      recall: "Where is the gitops repo?",
      answer: "github.com/acme/infrastructure",
    },
  ];

  const distractors = [
    "What is the capital of France?",
    "How many planets are in the solar system?",
    "What is 42 * 17?",
    "Describe the process of photosynthesis.",
    "What programming language was created by Guido van Rossum?",
    "Name three types of cloud computing services.",
    "What is the speed of light in meters per second?",
    "Explain the difference between TCP and UDP.",
    "Who wrote 'The Art of War'?",
    "What is the chemical formula for water?",
  ];

  return facts.map((f, i) => ({
    id: `retention-${i}`,
    question: f.recall,
    answer: f.answer,
    metadata: {
      teach: f.teach,
      distractors: distractors.slice(0, 5 + (i % 6)),
    },
  }));
}

export { seededShuffle };
