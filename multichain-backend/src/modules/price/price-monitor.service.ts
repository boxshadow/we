import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PriceService } from './price.service.js';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { PriceResult } from '../../common/types/common.types.js';

export interface WatchItem {
  chain: ChainType;
  tokenAddress: string;
  quoteTokenAddress?: string;
  thresholdPercent?: number; // e.g. 5 for 5% change alert
  lastPrice?: number;
  lastCheckedAt?: number;
}

export type PriceAlertCallback = (alert: {
  chain: ChainType;
  tokenAddress: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  timestamp: number;
}) => void;

@Injectable()
export class PriceMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceMonitorService.name);
  private watchlist = new Map<string, WatchItem>();
  private intervalHandle?: NodeJS.Timeout;
  private alertCallbacks: PriceAlertCallback[] = [];
  private readonly CHECK_INTERVAL_MS = 5000; // Check every 5s

  constructor(private readonly priceService: PriceService) {}

  onModuleInit() {
    this.startMonitoring();
  }

  onModuleDestroy() {
    this.stopMonitoring();
  }

  /**
   * Add a token to the real-time price monitoring watchlist
   */
  watch(
    chain: ChainType,
    tokenAddress: string,
    options?: { quoteTokenAddress?: string; thresholdPercent?: number },
  ) {
    const key = `${chain}:${tokenAddress.toLowerCase()}`;
    this.watchlist.set(key, {
      chain,
      tokenAddress,
      quoteTokenAddress: options?.quoteTokenAddress,
      thresholdPercent: options?.thresholdPercent ?? 3.0, // default 3% alert
    });
    this.logger.log(`Added [${chain}] ${tokenAddress} to price monitor watchlist`);
  }

  /**
   * Remove a token from the watchlist
   */
  unwatch(chain: ChainType, tokenAddress: string) {
    const key = `${chain}:${tokenAddress.toLowerCase()}`;
    this.watchlist.delete(key);
    this.logger.log(`Removed [${chain}] ${tokenAddress} from watchlist`);
  }

  /**
   * Register listener for price change alerts
   */
  onPriceChange(callback: PriceAlertCallback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get current watchlist snapshot
   */
  getWatchlist(): WatchItem[] {
    return Array.from(this.watchlist.values());
  }

  private startMonitoring() {
    if (this.intervalHandle) return;

    this.logger.log(`Starting background Price Monitor engine (Interval: ${this.CHECK_INTERVAL_MS}ms)`);
    this.intervalHandle = setInterval(async () => {
      await this.tick();
    }, this.CHECK_INTERVAL_MS);
  }

  private stopMonitoring() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      this.logger.log('Stopped background Price Monitor engine');
    }
  }

  private async tick() {
    for (const [key, item] of this.watchlist.entries()) {
      try {
        const result: PriceResult = await this.priceService.getPrice(
          item.chain,
          item.tokenAddress,
          item.quoteTokenAddress,
        );

        const currentPrice = result.priceUsd;
        if (item.lastPrice !== undefined && item.lastPrice > 0 && currentPrice > 0) {
          const delta = currentPrice - item.lastPrice;
          const changePercent = (delta / item.lastPrice) * 100;

          if (Math.abs(changePercent) >= (item.thresholdPercent || 3.0)) {
            this.logger.warn(
              ` PRICE ALERT [${item.chain}] ${item.tokenAddress}: Price moved from $${item.lastPrice} to $${currentPrice} (${changePercent.toFixed(2)}%)`,
            );

            // Notify subscribers
            for (const cb of this.alertCallbacks) {
              cb({
                chain: item.chain,
                tokenAddress: item.tokenAddress,
                oldPrice: item.lastPrice,
                newPrice: currentPrice,
                changePercent,
                timestamp: Date.now(),
              });
            }
          }
        }

        item.lastPrice = currentPrice;
        item.lastCheckedAt = Date.now();
      } catch (err: any) {
        this.logger.debug(`Error checking price for ${key}: ${err.message}`);
      }
    }
  }
}
