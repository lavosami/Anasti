import os


class Settings:
    def __init__(self) -> None:
        self.JWT_SECRET = os.getenv("JWT_SECRET", "")
        self.JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
        self.AMQP_URL = os.getenv("AMQP_URL", "amqp://guest:guest@rabbitmq:5672/")
        self.COLLECTOR_RPC_QUEUE = os.getenv("COLLECTOR_RPC_QUEUE", "collector.rpc")
        self.ANALYSIS_RPC_QUEUE = os.getenv("ANALYSIS_RPC_QUEUE", "analysis.rpc")
        self.RPC_TIMEOUT_SECONDS = float(os.getenv("RPC_TIMEOUT_SECONDS", "30"))
        self.CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")


settings = Settings()
