import * as amqplib from 'amqplib';

export class MetadataPublisher {
  private static readonly EXCHANGE = 'metadata.events';

  static async publishMetadataUpdated(version: number): Promise<void> {
    const rabbitUrl = process.env.RABBITMQ_METADATA_URL;
    if (!rabbitUrl) {
      console.warn('[Metadata Publisher] RABBITMQ_METADATA_URL is not defined. Skipping event publish.');
      return;
    }

    let connection: any = null;
    let channel: any = null;

    try {
      // Connect to the broker using the metadata specific URL
      connection = await amqplib.connect(rabbitUrl);
      channel = await connection.createChannel();

      // Ensure the exchange exists
      await channel.assertExchange(this.EXCHANGE, 'topic', { durable: true });

      const message = {
        event: 'METADATA_UPDATED',
        version,
        timestamp: new Date().toISOString()
      };

      const routingKey = 'metadata.updated';
      const payload = Buffer.from(JSON.stringify(message));

      // Publish the lightweight notification
      channel.publish(this.EXCHANGE, routingKey, payload, { persistent: true });
      console.log(`[Metadata Publisher] Successfully published ${routingKey} event for version ${version}`);
      
    } catch (error) {
      console.error('[Metadata Publisher] Failed to publish metadata update event:', error);
    } finally {
      if (channel) {
        try { await channel.close(); } catch (e) {}
      }
      if (connection) {
        try { await connection.close(); } catch (e) {}
      }
    }
  }
}
