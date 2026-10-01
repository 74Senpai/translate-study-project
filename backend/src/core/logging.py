import sys
from loguru import logger


def setup_logging(debug: bool = False):
    logger.remove()
    level = "DEBUG" if debug else "INFO"
    logger.add(
        sys.stdout,
        level=level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level}</level> | <cyan>{name}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    )
