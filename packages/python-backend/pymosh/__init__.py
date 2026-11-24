from .container import avi

__all__ = ['Index']


class Index(object):
    """Index is an index of video frame data."""

    def __init__(self):
        pass

    @staticmethod
    def from_file(filename: str):
        instance = Index()
        instance.filename = filename
        instance.index = None

        # Assume AVI for now
        instance.index = avi.AVIFile.from_file(filename)

        return instance

    def close(self):
        """Close the file handle held open by the lazy chunk readers."""
        if self.index is not None and self.index.riff is not None:
            self.index.riff.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def __getattr__(self, index):
        return getattr(self.index, index)

    def __iter__(self):
        return iter(self.index)
