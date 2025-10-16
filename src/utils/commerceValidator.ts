import axios from 'axios';
import { Logger } from './logger';
import { TIMEOUTS } from './timeoutConfig';

export class CommerceValidator {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async validateUrl(url: string): Promise<boolean> {
        try {
            const graphqlUrl = `${url}/graphql`;
            const response = await axios.post(
                graphqlUrl,
                {
                    query: '{ storeConfig { store_name } }'
                },
                {
                    timeout: TIMEOUTS.COMMERCE_VALIDATION,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data?.data?.storeConfig) {
                this.logger.info(`Valid Commerce instance: ${response.data.data.storeConfig.store_name}`);
                return true;
            }

            return false;
        } catch (error) {
            this.logger.warn(`Commerce validation failed for ${url}:`, error);
            return false;
        }
    }

    public async validateApiKey(endpoint: string, apiKey: string): Promise<boolean> {
        try {
            const response = await axios.get(endpoint, {
                headers: {
                    'x-api-key': apiKey
                },
                timeout: TIMEOUTS.COMMERCE_VALIDATION
            });

            return response.status === 200;
        } catch (error) {
            this.logger.warn('API key validation failed:', error);
            return false;
        }
    }
}