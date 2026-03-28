import { Queue, Worker, QueueScheduler, Job } from 'bullmq';
import IORedis from 'ioredis';

const redisConnection = new IORedis({
  host: '127.0.0.1',
  port: 6379,
});

export { redisConnection, Queue, Worker, QueueScheduler, Job };