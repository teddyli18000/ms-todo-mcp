export class SingleFlight<T> {
  private active?: Promise<T>;

  run(factory: () => Promise<T>): Promise<T> {
    if (this.active) return this.active;
    const promise = factory().finally(() => {
      if (this.active === promise) this.active = undefined;
    });
    this.active = promise;
    return promise;
  }
}
