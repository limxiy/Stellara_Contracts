import { Worker, Job, redisConnection } from '../services/queue.service';
import { emailQueueName } from '../queues/email.queue';

// Worker processes jobs from the queue
const emailWorker = new Worker(
  emailQueueName,
  async (job: Job) => {
    console.log(`Processing email job #${job.id}...`);
    console.log('Job data:', job.data);

    // Simulate email sending
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(`Email sent to ${job.data.to}`);

    // Return result
    return { success: true };
  },
  { connection: redisConnection, concurrency: 2 } // process 2 emails at a time
);

emailWorker.on('completed', (job) => {
  console.log(`Job #${job.id} completed successfully`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job #${job?.id} failed:`, err);
});